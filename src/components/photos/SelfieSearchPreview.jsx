import React, { useEffect, useRef, useState } from 'react';

const FACE_API_MODEL_URL = '/models/face-api';
const MAX_EXPERIMENTAL_PHOTOS = 20;
const MAX_EXPERIMENTAL_DISTANCE = 0.52;
let faceApiModulePromise = null;
let faceDetectorModelPromise = null;
let faceMatcherModelPromise = null;

function getSelfieFaceApi() {
  if (!faceApiModulePromise) {
    faceApiModulePromise = import('face-api.js');
  }
  return faceApiModulePromise;
}

async function loadFaceDetectorModel() {
  const faceapi = await getSelfieFaceApi();
  if (!faceDetectorModelPromise) {
    faceDetectorModelPromise = faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_MODEL_URL);
  }
  await faceDetectorModelPromise;
  return faceapi;
}

async function loadFaceMatcherModels() {
  const faceapi = await getSelfieFaceApi();
  if (!faceMatcherModelPromise) {
    faceMatcherModelPromise = Promise.all([
      loadFaceDetectorModel(),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_API_MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(FACE_API_MODEL_URL),
    ]);
  }
  await faceMatcherModelPromise;
  return faceapi;
}

export default function SelfieSearchPreview({ galleryPhotos = [] }) {
  const [selfieUrl, setSelfieUrl] = useState('');
  const [selfieName, setSelfieName] = useState('');
  const [selfieFile, setSelfieFile] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState('idle');
  const [analysisMessage, setAnalysisMessage] = useState('Subi una selfie para validar si tiene un rostro claro.');
  const [assistedSearchStatus, setAssistedSearchStatus] = useState('idle');
  const [assistedSearchMessage, setAssistedSearchMessage] = useState('');
  const [assistedProgress, setAssistedProgress] = useState('');
  const [assistedResults, setAssistedResults] = useState([]);
  const [sampleLimited, setSampleLimited] = useState(false);
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const analysisRunRef = useRef(0);
  const assistedSearchRunRef = useRef(0);

  const stopCameraStream = () => {
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (!streamRef.current) return;
    streamRef.current.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => () => {
    if (selfieUrl) URL.revokeObjectURL(selfieUrl);
  }, [selfieUrl]);

  useEffect(() => () => {
    stopCameraStream();
    assistedSearchRunRef.current += 1;
  }, []);

  useEffect(() => {
    if (!cameraActive || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play();
  }, [cameraActive]);

  const loadSelfie = (file, fallbackName = 'selfie') => {
    if (!file || !file.type?.startsWith('image/')) return;
    stopCameraStream();
    const nextUrl = URL.createObjectURL(file);
    const nextRun = analysisRunRef.current + 1;
    analysisRunRef.current = nextRun;
    setSelfieUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      return nextUrl;
    });
    setSelfieName(file.name || fallbackName);
    setSelfieFile(file);
    setCameraActive(false);
    resetAssistedSearch();
    void analyzeSelfie(file, nextRun);
  };

  const handleFileChange = (event) => {
    loadSelfie(event.target.files?.[0]);
    event.target.value = '';
  };

  const handleDrop = (event) => {
    event.preventDefault();
    loadSelfie(event.dataTransfer.files?.[0]);
  };

  const openPicker = () => fileInputRef.current?.click();

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setAnalysisStatus('warning');
      setAnalysisMessage('No pudimos acceder a la camara. Podes subir una selfie desde tu galeria.');
      return;
    }

    stopCameraStream();
    setAnalysisStatus('idle');
    setAnalysisMessage('Ubica tu rostro dentro del recuadro y toma la selfie.');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'user' },
          width: { ideal: 960 },
          height: { ideal: 1280 },
        },
        audio: false,
      });

      streamRef.current = stream;
      setCameraActive(true);
    } catch (error) {
      console.warn('YakuExpress camera permission error:', error);
      stopCameraStream();
      setCameraActive(false);
      setAnalysisStatus('warning');
      setAnalysisMessage('No pudimos acceder a la camara. Podes subir una selfie desde tu galeria.');
    }
  };

  const cancelCamera = () => {
    stopCameraStream();
    setCameraActive(false);
    setAnalysisStatus(selfieFile ? analysisStatus : 'idle');
    setAnalysisMessage(selfieFile ? analysisMessage : 'Subi una selfie para validar si tiene un rostro claro.');
  };

  const resetAssistedSearch = () => {
    assistedSearchRunRef.current += 1;
    setAssistedSearchStatus('idle');
    setAssistedSearchMessage('');
    setAssistedProgress('');
    setAssistedResults([]);
    setSampleLimited(false);
  };

  const runAssistedSearchPreview = async () => {
    if (analysisStatus !== 'success' || !selfieFile) return;

    const searchRun = assistedSearchRunRef.current + 1;
    assistedSearchRunRef.current = searchRun;
    const photosToAnalyze = galleryPhotos.slice(0, MAX_EXPERIMENTAL_PHOTOS);

    setAssistedSearchStatus('loading');
    setAssistedSearchMessage('');
    setAssistedResults([]);
    setSampleLimited(galleryPhotos.length > MAX_EXPERIMENTAL_PHOTOS);
    setAssistedProgress('Cargando reconocimiento facial...');

    try {
      const faceapi = await loadFaceMatcherModels();
      const selfieDescriptor = await createSelfieDescriptor(faceapi, selfieFile);

      if (!selfieDescriptor) {
        setAssistedSearchStatus('done');
        setAssistedSearchMessage('No encontramos posibles coincidencias claras. Proba con una selfie con mejor luz, sin lentes oscuros y mirando de frente.');
        setAssistedProgress('');
        return;
      }

      if (!photosToAnalyze.length) {
        setAssistedSearchStatus('done');
        setAssistedSearchMessage('Carga primero tu galeria para probar la busqueda experimental con fotos disponibles.');
        setAssistedProgress('');
        return;
      }

      const nextResults = [];

      for (let index = 0; index < photosToAnalyze.length; index += 1) {
        if (assistedSearchRunRef.current !== searchRun) return;

        const photo = photosToAnalyze[index];
        setAssistedProgress(`Analizando foto ${index + 1} de ${photosToAnalyze.length}...`);
        await waitForUi();

        try {
          const descriptors = await createPhotoDescriptors(faceapi, photo);
          if (!descriptors.length) continue;

          const bestDistance = Math.min(
            ...descriptors.map((descriptor) => faceapi.euclideanDistance(selfieDescriptor, descriptor)),
          );
          if (bestDistance <= MAX_EXPERIMENTAL_DISTANCE) {
            nextResults.push({
              photo,
              distance: bestDistance,
              level: matchLevelFor(bestDistance),
            });
          }
        } catch (photoError) {
          console.warn('YakuExpress experimental face match skipped photo:', photoError);
        }
      }

      if (assistedSearchRunRef.current !== searchRun) return;

      const orderedResults = nextResults
        .sort((left, right) => left.distance - right.distance)
        .slice(0, 6);

      setAssistedResults(orderedResults);
      setAssistedSearchStatus('done');
      setAssistedProgress('');
      setAssistedSearchMessage(
        assistedMessageFor(orderedResults),
      );
    } catch (error) {
      console.error('YakuExpress experimental gallery analysis error:', error);
      if (assistedSearchRunRef.current !== searchRun) return;
      setAssistedSearchStatus('error');
      setAssistedProgress('');
      setAssistedSearchMessage('No pudimos analizar la galeria en este momento. Podes seguir eligiendo tus fotos manualmente.');
    }
  };

  const captureCameraSelfie = async () => {
    const video = videoRef.current;
    if (!video) return;

    const width = video.videoWidth || 720;
    const height = video.videoHeight || 960;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return;

    context.drawImage(video, 0, 0, width, height);
    const blob = await canvasToBlob(canvas);
    if (!blob) return;

    const file = new File([blob], `selfie-camara-${Date.now()}.jpg`, { type: 'image/jpeg' });
    stopCameraStream();
    setCameraActive(false);
    loadSelfie(file, 'selfie-camara.jpg');
  };

  const analyzeSelfie = async (file, runId = analysisRunRef.current + 1) => {
    if (!file) return;

    analysisRunRef.current = runId;
    setAnalysisStatus('loading');
    setAnalysisMessage('Cargando reconocimiento facial...');

    try {
      const faceapi = await loadFaceDetectorModel();
      setAnalysisMessage('Analizando tu selfie en este navegador...');
      const image = await loadImageElement(file);
      const detection = await faceapi.detectSingleFace(
        image,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.45 }),
      );

      if (analysisRunRef.current !== runId) return;

      if (detection) {
        setAnalysisStatus('success');
        setAnalysisMessage('Rostro detectado correctamente.');
      } else {
        setAnalysisStatus('warning');
        setAnalysisMessage('No encontramos un rostro claro. Proba con mas luz, sin lentes oscuros y mirando de frente.');
      }
    } catch (error) {
      console.error('YakuExpress selfie face detection error:', error);
      if (analysisRunRef.current !== runId) return;
      setAnalysisStatus('warning');
      setAnalysisMessage('No pudimos analizar esta selfie. Proba con otra foto clara y frontal.');
    }
  };

  return (
    <section className="selfie-search-card" aria-label="Buscar mis fotos con selfie">
      <div className="selfie-search-copy">
        <span className="selfie-beta">IA local fase 1</span>
        <h2>Busca tus fotos con selfie</h2>
        <p>Sube una foto tuya para confirmar si la selfie contiene un rostro claro.</p>
      </div>

      <div
        className={`selfie-dropzone ${selfieUrl ? 'has-selfie' : ''} ${analysisStatus !== 'idle' ? `is-${analysisStatus}` : ''}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          capture="user"
          onChange={handleFileChange}
          aria-label="Subir selfie"
        />

        {cameraActive ? (
          <div className="selfie-camera-preview">
            <video ref={videoRef} autoPlay muted playsInline aria-label="Vista previa de camara para selfie" />
            <small>Vista previa en vivo. La imagen no se guarda ni se envia.</small>
          </div>
        ) : selfieUrl ? (
          <div className="selfie-preview">
            <img src={selfieUrl} alt="Selfie cargada" />
            <div>
              <strong>Tu selfie cargada</strong>
              <small>{selfieName}</small>
            </div>
          </div>
        ) : (
          <div className="selfie-empty">
            <b aria-hidden="true">CAM</b>
            <strong>Subir selfie</strong>
            <small>JPG, PNG o WEBP. En celular puedes usar camara o galeria.</small>
          </div>
        )}

        <div className="selfie-guidance" aria-label="Consejos para una selfie detectable">
          <strong>Para mejores resultados: buena luz, rostro de frente y sin lentes oscuros.</strong>
          <div className="selfie-checklist">
            <span>Buena luz</span>
            <span>Rostro completo</span>
            <span>Mira de frente</span>
            <span>Sin lentes oscuros</span>
          </div>
        </div>

        <div className="selfie-actions">
          {cameraActive ? (
            <>
              <button type="button" onClick={captureCameraSelfie}>
                Usar esta selfie
              </button>
              <button type="button" className="ghost" onClick={cancelCamera}>
                Cancelar camara
              </button>
            </>
          ) : (
            <>
              <button type="button" className="ghost" onClick={openPicker}>
                {selfieUrl ? 'Cambiar selfie' : 'Subir selfie'}
              </button>
              <button type="button" className="ghost" onClick={startCamera}>
                Tomar selfie
              </button>
              <button
                type="button"
                onClick={() => analyzeSelfie(selfieFile)}
                disabled={!selfieFile || analysisStatus === 'loading'}
              >
                {analysisStatus === 'loading' ? 'Analizando...' : 'Detectar rostro'}
              </button>
            </>
          )}
        </div>

        <div className={`selfie-analysis-result is-${analysisStatus}`} aria-live="polite">
          <span aria-hidden="true">
            {analysisStatus === 'success' ? 'OK' : analysisStatus === 'warning' ? '!' : analysisStatus === 'loading' ? '...' : 'IA'}
          </span>
          <strong>{analysisMessage}</strong>
        </div>

        {analysisStatus === 'success' && (
          <div className="selfie-assisted-search">
            <button
              type="button"
              onClick={runAssistedSearchPreview}
              disabled={assistedSearchStatus === 'loading'}
            >
              {assistedSearchStatus === 'loading' ? 'Analizando la galeria...' : 'Buscar posibles fotos'}
            </button>

            {assistedSearchStatus === 'loading' && (
              <div className="selfie-assisted-loading" aria-live="polite">
                <span />
                <strong>{assistedProgress || 'Analizando la galeria...'}</strong>
              </div>
            )}

            {(assistedSearchStatus === 'done' || assistedSearchStatus === 'error') && (
              <section className={`selfie-assisted-results ${assistedSearchStatus === 'error' ? 'is-error' : ''}`} aria-label="Posibles coincidencias experimentales">
                <small>Posibles coincidencias</small>
                <strong>{assistedSearchMessage}</strong>
                <em>Busqueda experimental. Revisa las fotos antes de seleccionarlas.</em>
                {sampleLimited && (
                  <p>Analizamos una muestra inicial para mantener la busqueda rapida.</p>
                )}
                {assistedResults.length > 0 && (
                  <div className="selfie-assisted-grid">
                    {assistedResults.map(({ photo, level }, index) => (
                      <div className="selfie-assisted-thumb" key={photo.id || photo.publicId || photo.thumbUrl}>
                        <img src={photo.thumbUrl || photo.fullUrl} alt={`Posible foto ${index + 1}`} />
                        <span>{level === 'Debil' ? 'Coincidencia debil. Revisa con cuidado.' : 'Posible coincidencia'}</span>
                        <b>{level}</b>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>

      <small className="selfie-disclaimer">
        Tu selfie no se guarda, no se sube y no se comparte.
      </small>
    </section>
  );
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(imageUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(new Error('No se pudo leer la imagen de selfie.'));
    };
    image.src = imageUrl;
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92);
  });
}

async function createSelfieDescriptor(faceapi, file) {
  const image = await loadImageElement(file);
  const result = await faceapi
    .detectSingleFace(image, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.45 }))
    .withFaceLandmarks(true)
    .withFaceDescriptor();
  return result?.descriptor || null;
}

async function createPhotoDescriptors(faceapi, photo) {
  const imageUrl = photo.thumbUrl || photo.fullUrl;
  if (!imageUrl) return [];

  const image = await loadRemoteImageElement(imageUrl);
  const results = await faceapi
    .detectAllFaces(image, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.35 }))
    .withFaceLandmarks(true)
    .withFaceDescriptors();

  return results.map((result) => result.descriptor).filter(Boolean);
}

function loadRemoteImageElement(imageUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo leer una foto de la galeria.'));
    image.src = imageUrl;
  });
}

function matchLevelFor(distance) {
  if (distance <= 0.42) return 'Mas probable';
  if (distance <= 0.48) return 'Revisar';
  return 'Debil';
}

function assistedMessageFor(results) {
  if (!results.length) {
    return 'No encontramos posibles coincidencias claras. Podes seguir eligiendo tus fotos manualmente.';
  }
  if (results.every((result) => result.level === 'Debil')) {
    return 'No encontramos coincidencias claras. Te mostramos coincidencias debiles solo para revision manual.';
  }
  return 'Estas podrian ser tus fotos. Revisa con cuidado antes de seleccionar.';
}

function waitForUi() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 20);
  });
}
