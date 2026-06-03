import React, { useEffect, useRef, useState } from 'react';

const FACE_API_MODEL_URL = '/models/face-api';
const MAX_GROUP_SELFIES = 5;
const MAX_GROUP_DISTANCE = 0.54;
const SINGLE_MEMBER_RECOMMENDED_DISTANCE = 0.48;
const GROUP_SEARCH_BATCH_SIZE = 8;
const BACKGROUND_PRECACHE_DELAY_MS = 3000;
const BACKGROUND_PRECACHE_BATCH_SIZE = 2;
const BACKGROUND_PRECACHE_PAUSE_MS = 800;
const BACKGROUND_PRECACHE_LIMIT = 40;
const BACKGROUND_PRECACHE_MAX_ERRORS = 5;
const CAMERA_REOPEN_DELAY_MS = 300;
let groupFaceApiPromise = null;
let groupFaceModelsPromise = null;

function getGroupFaceApi() {
  if (!groupFaceApiPromise) {
    groupFaceApiPromise = import('face-api.js');
  }
  return groupFaceApiPromise;
}

async function loadGroupFaceModels() {
  const faceapi = await getGroupFaceApi();
  if (!groupFaceModelsPromise) {
    groupFaceModelsPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_MODEL_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_API_MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(FACE_API_MODEL_URL),
    ]);
  }
  await groupFaceModelsPromise;
  return faceapi;
}

export default function GroupSelfieSearch({
  photos = [],
  selectedIds = [],
  onTogglePhoto,
  onOpenPhoto,
  watermarkEnabled = true,
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [groupSelfies, setGroupSelfies] = useState([]);
  const [searchStatus, setSearchStatus] = useState('idle');
  const [searchMessage, setSearchMessage] = useState('');
  const [searchProgress, setSearchProgress] = useState({ current: 0, total: 0 });
  const [groupResults, setGroupResults] = useState([]);
  const [faceApiStatus, setFaceApiStatus] = useState('idle');
  const [faceApiMessage, setFaceApiMessage] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraMessage, setCameraMessage] = useState('');
  const [cameraPreviewReady, setCameraPreviewReady] = useState(false);
  const [cameraOpening, setCameraOpening] = useState(false);
  const [cameraCapturing, setCameraCapturing] = useState(false);
  const [validatingSelfiesCount, setValidatingSelfiesCount] = useState(0);
  const [debugIAEnabled] = useState(() => isDebugIAEnabled());
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const cameraSourceRef = useRef('');
  const cameraStartingRef = useRef(false);
  const cameraSessionIdRef = useRef(0);
  const cameraClosingUntilRef = useRef(0);
  const cameraPreviewAbortRef = useRef(null);
  const cameraFrameRequestRef = useRef(null);
  const cameraCapturingRef = useRef(false);
  const validatingSelfiesRef = useRef(0);
  const searchRunRef = useRef(0);
  const selfiesRef = useRef([]);
  const galleryFaceCacheRef = useRef(new Map());
  const gallerySignatureRef = useRef('');
  const precacheRunRef = useRef(0);
  const precacheTimeoutRef = useRef(null);
  const precachePreparedRef = useRef(0);

  const stopCamera = ({ clearMessage = false, markClosing = true, updateState = true } = {}) => {
    cameraSessionIdRef.current += 1;
    cameraStartingRef.current = false;
    cameraPreviewAbortRef.current?.abort();
    cameraPreviewAbortRef.current = null;
    if (cameraFrameRequestRef.current) {
      window.cancelAnimationFrame(cameraFrameRequestRef.current);
      cameraFrameRequestRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    cameraSourceRef.current = '';
    if (markClosing) {
      cameraClosingUntilRef.current = Date.now() + CAMERA_REOPEN_DELAY_MS;
    }
    if (updateState) {
      setCameraOpening(false);
      setCameraPreviewReady(false);
      if (clearMessage) setCameraMessage('');
    }
  };

  const cancelBackgroundPrecache = () => {
    precacheRunRef.current += 1;
    if (precacheTimeoutRef.current) {
      window.clearTimeout(precacheTimeoutRef.current);
      precacheTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    selfiesRef.current = groupSelfies;
  }, [groupSelfies]);

  useEffect(() => () => {
    cancelBackgroundPrecache();
    stopCamera({ updateState: false });
    selfiesRef.current.forEach((selfie) => {
      if (selfie.previewUrl) URL.revokeObjectURL(selfie.previewUrl);
    });
    searchRunRef.current += 1;
  }, []);

  useEffect(() => {
    if (!cameraActive || !streamRef.current) return undefined;

    let cancelled = false;
    const sessionId = cameraSessionIdRef.current;
    const previewAbort = new AbortController();
    cameraPreviewAbortRef.current?.abort();
    cameraPreviewAbortRef.current = previewAbort;
    const isSessionActive = () => (
      !cancelled
      && !previewAbort.signal.aborted
      && cameraSessionIdRef.current === sessionId
    );

    const attachCameraPreview = async () => {
      const video = videoRef.current;
      if (!video) {
        if (!isSessionActive()) return;
        setCameraMessage('Preparando vista previa...');
        return;
      }

      try {
        setCameraPreviewReady(false);
        setCameraMessage('Preparando vista previa...');
        video.muted = true;
        video.playsInline = true;
        if (video.srcObject !== streamRef.current) {
          video.srcObject = streamRef.current;
        }

        await waitForVideoMetadata(video, previewAbort.signal);
        if (!isSessionActive()) return;
        await video.play();
        if (!isSessionActive()) return;
        await waitForCameraFrame(video, previewAbort.signal, cameraFrameRequestRef);
        if (!isSessionActive()) return;

        if (hasCameraFrame(video)) {
          setCameraPreviewReady(true);
          setCameraMessage('Camara lista. Usa una selfie individual, con buena luz y rostro de frente.');
        } else {
          setCameraPreviewReady(false);
          setCameraMessage('Preparando vista previa...');
        }
      } catch (error) {
        console.warn('YakuExpress camera preview warning:', {
          stage: 'video.play',
          name: error?.name || 'UnknownError',
        });
        if (!isSessionActive()) return;
        stopCamera();
        setCameraActive(false);
        setCameraPreviewReady(false);
        setCameraMessage('No pudimos abrir la camara. Revisa el permiso de camara o subi una foto desde tus archivos.');
      }
    };

    void attachCameraPreview();

    return () => {
      cancelled = true;
      previewAbort.abort();
      if (cameraPreviewAbortRef.current === previewAbort) {
        cameraPreviewAbortRef.current = null;
      }
    };
  }, [cameraActive]);

  useEffect(() => {
    const nextSignature = createGalleryCacheSignature(photos);
    if (gallerySignatureRef.current && gallerySignatureRef.current !== nextSignature) {
      cancelBackgroundPrecache();
      galleryFaceCacheRef.current.clear();
      precachePreparedRef.current = 0;
    }
    gallerySignatureRef.current = nextSignature;
  }, [photos]);

  useEffect(() => {
    cancelBackgroundPrecache();

    if (!photos.length || searchStatus === 'loading' || cameraActive || groupSelfies.length > 0) return undefined;
    if (isBackgroundPrecacheComplete(photos, galleryFaceCacheRef.current)) return undefined;

    const runId = precacheRunRef.current;
    precacheTimeoutRef.current = window.setTimeout(() => {
      void runBackgroundPrecache(runId);
    }, BACKGROUND_PRECACHE_DELAY_MS);

    return cancelBackgroundPrecache;
  }, [photos, searchStatus, cameraActive, groupSelfies.length]);

  const validSelfies = groupSelfies.filter((selfie) => selfie.status === 'valid' && selfie.descriptor);
  const canAddMembers = groupSelfies.length < MAX_GROUP_SELFIES;
  const canSearch = validSelfies.length > 0 && searchStatus !== 'loading';
  const showRecoveryCard = searchStatus === 'done' && photos.length > 0 && groupResults.length === 0;
  const canStartCamera = canAddMembers
    && searchStatus !== 'loading'
    && !cameraActive
    && !cameraOpening
    && !cameraCapturing
    && validatingSelfiesCount === 0;

  const openFilePicker = () => fileInputRef.current?.click();

  const addSelfies = (event) => {
    cancelBackgroundPrecache();
    const files = Array.from(event.target.files || [])
      .filter((file) => file.type?.startsWith('image/'));
    event.target.value = '';
    addSelfieFiles(files);
  };

  const addSelfieFiles = (files) => {
    const availableSlots = MAX_GROUP_SELFIES - groupSelfies.length;
    const filesToAdd = Array.from(files || [])
      .filter((file) => file.type?.startsWith('image/'))
      .slice(0, availableSlots);

    if (!availableSlots) {
      setCameraMessage('Ya cargaste el maximo de 5 integrantes.');
      return;
    }

    if (!filesToAdd.length) return;

    const nextSelfies = filesToAdd.map((file) => ({
      id: createLocalId(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'pending',
      message: 'Buscando rostro...',
      descriptor: null,
    }));

    setGroupSelfies((current) => [...current, ...nextSelfies]);
    setCameraMessage('');
    resetSearchResults();
    nextSelfies.forEach((selfie) => {
      void validateGroupSelfie(selfie);
    });
  };

  const removeSelfie = (selfieId) => {
    cancelBackgroundPrecache();
    setGroupSelfies((current) => {
      const selfie = current.find((item) => item.id === selfieId);
      if (selfie?.previewUrl) URL.revokeObjectURL(selfie.previewUrl);
      return current.filter((item) => item.id !== selfieId);
    });
    resetSearchResults();
  };

  const clearGroupSearch = () => {
    cancelBackgroundPrecache();
    stopCamera();
    setCameraActive(false);
    setCameraPreviewReady(false);
    setCameraMessage('');
    setGroupSelfies((current) => {
      current.forEach((selfie) => {
        if (selfie.previewUrl) URL.revokeObjectURL(selfie.previewUrl);
      });
      return [];
    });
    resetSearchResults();
  };

  const togglePanel = () => {
    setPanelOpen((open) => {
      if (open) {
        cancelBackgroundPrecache();
        stopCamera();
        setCameraActive(false);
        setCameraPreviewReady(false);
        setCameraMessage('');
      }
      return !open;
    });
  };

  const resetSearchResults = () => {
    searchRunRef.current += 1;
    setSearchStatus('idle');
    setSearchMessage('');
    setSearchProgress({ current: 0, total: 0 });
    setGroupResults([]);
  };

  const prepareGroupFaceApi = async () => {
    setFaceApiStatus('loading');
    setFaceApiMessage('Cargando reconocimiento facial...');

    try {
      const loadedFaceApi = await loadGroupFaceModels();
      setFaceApiStatus('ready');
      setFaceApiMessage('Listo para buscar fotos de tu grupo.');
      return loadedFaceApi;
    } catch (error) {
      setFaceApiStatus('error');
      setFaceApiMessage('Hubo un problema cargando la busqueda inteligente. Proba recargar la pagina.');
      throw error;
    }
  };

  const startCamera = async () => {
    cancelBackgroundPrecache();
    if (cameraStartingRef.current || cameraOpening || cameraActive || cameraCapturing) {
      setCameraMessage('Preparando camara...');
      return;
    }
    if (!canAddMembers) {
      setCameraMessage('Ya cargaste el maximo de 5 integrantes.');
      return;
    }
    if (searchStatus === 'loading') return;
    if (validatingSelfiesRef.current > 0 || validatingSelfiesCount > 0) {
      setCameraMessage('Estamos validando la selfie anterior...');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraMessage('No pudimos abrir la camara. Podes subir una foto desde tus archivos.');
      return;
    }

    stopCamera({ markClosing: false });
    setCameraPreviewReady(false);
    setCameraOpening(true);
    setCameraMessage('Abriendo camara...');
    const waitTime = Math.max(0, cameraClosingUntilRef.current - Date.now());
    const sessionId = cameraSessionIdRef.current + 1;
    cameraSessionIdRef.current = sessionId;
    cameraStartingRef.current = true;

    try {
      if (waitTime > 0) {
        await waitForDelay(waitTime);
        if (cameraSessionIdRef.current !== sessionId) return;
      }

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'user' } },
          audio: false,
        });
        cameraSourceRef.current = 'frontal';
      } catch (frontCameraError) {
        console.warn('YakuExpress camera getUserMedia warning:', {
          stage: 'getUserMedia',
          name: frontCameraError?.name || 'UnknownError',
        });
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        cameraSourceRef.current = 'fallback';
      }

      if (cameraSessionIdRef.current !== sessionId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      cameraStartingRef.current = false;
      setCameraOpening(false);
      setCameraActive(true);
      setCameraMessage('Preparando vista previa...');
    } catch (error) {
      console.warn('YakuExpress camera getUserMedia warning:', {
        stage: 'getUserMedia',
        name: error?.name || 'UnknownError',
      });
      stopCamera();
      setCameraActive(false);
      setCameraOpening(false);
      setCameraPreviewReady(false);
      setCameraMessage(cameraErrorMessage(error));
    } finally {
      if (cameraSessionIdRef.current === sessionId) {
        cameraStartingRef.current = false;
        setCameraOpening(false);
      }
    }
  };

  const cancelCamera = () => {
    stopCamera();
    setCameraActive(false);
    setCameraPreviewReady(false);
    setCameraMessage('');
  };

  const captureCameraSelfie = async () => {
    const video = videoRef.current;
    if (!video || searchStatus === 'loading' || !canAddMembers || cameraCapturingRef.current) return;
    if (!cameraPreviewReady || !hasCameraFrame(video)) {
      setCameraMessage('Preparando camara...');
      console.warn('YakuExpress camera capture warning:', {
        stage: 'capture',
        name: 'VideoFrameNotReady',
      });
      return;
    }

    const sessionId = cameraSessionIdRef.current;
    cameraCapturingRef.current = true;
    setCameraCapturing(true);
    setCameraMessage('Capturando selfie...');
    const width = video.videoWidth;
    const height = video.videoHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      cameraCapturingRef.current = false;
      setCameraCapturing(false);
      return;
    }

    context.drawImage(video, 0, 0, width, height);
    const blob = await canvasToBlob(canvas);
    if (!blob) {
      cameraCapturingRef.current = false;
      setCameraCapturing(false);
      setCameraMessage('No pudimos capturar la selfie. Proba nuevamente.');
      return;
    }
    if (cameraSessionIdRef.current !== sessionId) {
      cameraCapturingRef.current = false;
      setCameraCapturing(false);
      return;
    }

    const file = new File([blob], `selfie-grupo-${Date.now()}.jpg`, { type: 'image/jpeg' });
    stopCamera();
    setCameraActive(false);
    setCameraPreviewReady(false);
    cameraCapturingRef.current = false;
    setCameraCapturing(false);
    addSelfieFiles([file]);
    setCameraMessage('Estamos validando tu selfie...');
  };

  const validateGroupSelfie = async (selfie) => {
    cancelBackgroundPrecache();
    validatingSelfiesRef.current += 1;
    setValidatingSelfiesCount(validatingSelfiesRef.current);
    try {
      const faceapi = await prepareGroupFaceApi();
      const image = await loadImageElement(selfie.file);
      const detections = await detectSelfieFaceDescriptors(faceapi, image);

      if (!detections.length) {
        updateSelfie(selfie.id, {
          status: 'error',
          message: 'No encontramos un rostro claro en esta selfie. Proba con otra foto.',
          descriptor: null,
        });
        return;
      }

      if (detections.length > 1) {
        updateSelfie(selfie.id, {
          status: 'error',
          message: 'Usa una selfie individual por integrante para mejorar la busqueda.',
          descriptor: null,
        });
        return;
      }

      updateSelfie(selfie.id, {
        status: 'valid',
        message: 'Rostro detectado',
        descriptor: detections[0].descriptor,
      });
    } catch (error) {
      console.error('YakuExpress group selfie analysis error:', error);
      updateSelfie(selfie.id, {
        status: 'error',
        message: 'No pudimos analizar esta selfie. Proba con otra foto clara.',
        descriptor: null,
      });
    } finally {
      validatingSelfiesRef.current = Math.max(0, validatingSelfiesRef.current - 1);
      setValidatingSelfiesCount(validatingSelfiesRef.current);
      if (validatingSelfiesRef.current === 0 && !streamRef.current) {
        setCameraMessage('');
      }
    }
  };

  const updateSelfie = (selfieId, patch) => {
    setGroupSelfies((current) => (
      current.map((selfie) => (selfie.id === selfieId ? { ...selfie, ...patch } : selfie))
    ));
  };

  const runGroupSearch = async () => {
    cancelBackgroundPrecache();
    const members = groupSelfies
      .map((selfie, index) => ({ ...selfie, memberNumber: index + 1 }))
      .filter((selfie) => selfie.status === 'valid' && selfie.descriptor);

    if (!members.length) return;

    const searchRun = searchRunRef.current + 1;
    searchRunRef.current = searchRun;
    setSearchStatus('loading');
    setSearchMessage('');
    setSearchProgress({ current: 0, total: photos.length });
    setGroupResults([]);

    try {
      const faceapi = await prepareGroupFaceApi();

      if (!photos.length) {
        setSearchStatus('done');
        setSearchProgress({ current: 0, total: 0 });
        setSearchMessage('Carga primero tu galeria para probar la busqueda de grupo.');
        return;
      }

      const nextResultsByPhoto = new Map();
      const photoDescriptorsCache = galleryFaceCacheRef.current;
      const totalPhotos = photos.length;

      for (let batchStart = 0; batchStart < totalPhotos; batchStart += GROUP_SEARCH_BATCH_SIZE) {
        if (searchRunRef.current !== searchRun) return;

        const batch = photos.slice(batchStart, batchStart + GROUP_SEARCH_BATCH_SIZE);

        for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
          if (searchRunRef.current !== searchRun) return;

          const index = batchStart + batchIndex;
          const photo = batch[batchIndex];
          setSearchProgress({ current: index + 1, total: totalPhotos });

          try {
            const { detections, sourceUsed, cacheHit } = await getGalleryFaceDescriptors(faceapi, photo, photoDescriptorsCache);
            if (!detections.length) continue;

            const matchedMembers = matchMembersAgainstGalleryFaces(faceapi, members, detections);

            if (!matchedMembers.length) continue;

            const bestDistance = Math.min(...matchedMembers.map((member) => member.distance));
            nextResultsByPhoto.set(resultPhotoKey(photo, index), {
              photo,
              matchedMembers,
              matchedMembersCount: matchedMembers.length,
              bestDistance,
              confidenceLabel: confidenceLabelFor(bestDistance),
              originalIndex: index,
              debugInfo: createDebugInfo({
                matchedMembers,
                bestDistance,
                confidenceLabel: confidenceLabelFor(bestDistance),
                detectedFacesCount: detections.length,
                sourceUsed,
                cacheHit,
                originalIndex: index,
              }),
            });
          } catch (photoError) {
            console.warn('YakuExpress group search skipped photo:', photoError);
          }
        }

        if (searchRunRef.current !== searchRun) return;
        const partialResults = groupResultsByConfidence(Array.from(nextResultsByPhoto.values()));
        setGroupResults(partialResults);
        setSearchMessage(partialGroupResultsMessage(partialResults));

        await releaseUiThread();
      }

      if (searchRunRef.current !== searchRun) return;

      const orderedResults = groupResultsByConfidence(Array.from(nextResultsByPhoto.values()));

      setGroupResults(orderedResults);
      setSearchStatus('done');
      setSearchProgress({ current: 0, total: 0 });
      setSearchMessage(groupResultsMessage(orderedResults));
    } catch (error) {
      console.error('YakuExpress group face search error:', error);
      if (searchRunRef.current !== searchRun) return;
      setSearchStatus('error');
      setSearchProgress({ current: 0, total: 0 });
      setSearchMessage('No pudimos analizar la galeria en este momento. Podes seguir eligiendo tus fotos manualmente.');
    }
  };

  const runBackgroundPrecache = async (runId) => {
    if (!photos.length || searchStatus === 'loading' || cameraActive || groupSelfies.length > 0) return;

    let consecutiveErrors = 0;

    try {
      const faceapi = await loadGroupFaceModels();
      const photosToPrepare = photos.slice(0, BACKGROUND_PRECACHE_LIMIT);

      for (let batchStart = 0; batchStart < photosToPrepare.length; batchStart += BACKGROUND_PRECACHE_BATCH_SIZE) {
        if (precacheRunRef.current !== runId || searchStatus === 'loading' || cameraActive || selfiesRef.current.length > 0) return;

        const batch = photosToPrepare.slice(batchStart, batchStart + BACKGROUND_PRECACHE_BATCH_SIZE);

        for (const photo of batch) {
          if (precacheRunRef.current !== runId || searchStatus === 'loading' || cameraActive || selfiesRef.current.length > 0) return;

          const cacheKey = galleryPhotoCacheKey(photo);
          if (cacheKey && galleryFaceCacheRef.current.has(cacheKey)) continue;

          try {
            await getGalleryFaceDescriptors(faceapi, photo, galleryFaceCacheRef.current);
            precachePreparedRef.current += 1;
            consecutiveErrors = 0;
          } catch (error) {
            consecutiveErrors += 1;
            if (consecutiveErrors >= BACKGROUND_PRECACHE_MAX_ERRORS) return;
          }
        }

        await waitForBackgroundPrecache();
      }
    } catch (error) {
      // El precache es oportunista: si falla, la busqueda real sigue funcionando.
    }
  };

  return (
    <section className="group-selfie-search" aria-label="Buscar fotos de mi grupo">
      <div className="group-selfie-intro">
        <span>IA de fotos</span>
        <div>
          <small>Nuevo</small>
          <h2>Encontra las fotos de tu grupo</h2>
          <p>Subi una selfie individual de cada integrante y te mostraremos las fotos mas recomendadas para revisar y comprar.</p>
        </div>
        <button type="button" onClick={togglePanel}>
          {panelOpen ? 'Cerrar busqueda' : 'Buscar fotos de mi grupo'}
        </button>
      </div>

      {panelOpen && (
        <div className="group-selfie-panel">
          <div className={`group-selfie-guide ${groupSelfies.length ? 'is-compact' : ''}`}>
            <div className="group-selfie-guide-copy">
              <span aria-hidden="true">Selfie clara</span>
              <div>
                <strong>Toma una selfie clara para encontrar mejor tus fotos</strong>
                <p>Usamos una selfie por integrante para buscar posibles coincidencias en la galeria.</p>
              </div>
            </div>
            <div className="group-selfie-guide-tips" aria-label="Consejos para una mejor selfie">
              <span>Rostro de frente</span>
              <span>Buena iluminacion</span>
              <span>Una persona por selfie</span>
              <span>Sin lentes oscuros si es posible</span>
            </div>
            <p className="group-selfie-privacy">
              Tus selfies se usan solo para esta busqueda en tu navegador. No se guardan ni se suben.
            </p>
          </div>

          <div className="group-selfie-toolbar">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={addSelfies}
              aria-label="Agregar selfies de integrantes"
            />
            <button type="button" onClick={openFilePicker} disabled={!canAddMembers}>
              Subir foto
            </button>
            <button type="button" className="ghost" onClick={startCamera} disabled={!canStartCamera}>
              {cameraOpening ? 'Abriendo camara...' : 'Tomar selfie'}
            </button>
            <button type="button" className="ghost" onClick={clearGroupSearch} disabled={!groupSelfies.length}>
              Limpiar busqueda
            </button>
            <button type="button" className="ghost" onClick={togglePanel}>
              Ver galeria completa
            </button>
          </div>

          {(cameraActive || cameraMessage) && (
            <div className="group-camera-card" aria-live="polite">
              {cameraActive && (
                <div className="group-camera-preview">
                  <video ref={videoRef} autoPlay muted playsInline aria-label="Vista previa de camara para selfie de integrante" />
                  <small>Vista previa en vivo. La selfie se usa solo en este navegador.</small>
                </div>
              )}
              {cameraMessage && <strong>{cameraMessage}</strong>}
              {cameraActive && (
                <div className="group-camera-actions">
                  <button type="button" onClick={captureCameraSelfie} disabled={!canAddMembers || searchStatus === 'loading' || !cameraPreviewReady}>
                    {cameraPreviewReady ? 'Capturar selfie' : 'Preparando camara...'}
                  </button>
                  <button type="button" className="ghost" onClick={cancelCamera}>
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          )}

          {faceApiMessage && (
            <div className={`group-ai-status is-${faceApiStatus}`} aria-live="polite">
              <strong>{faceApiMessage}</strong>
            </div>
          )}

          <div className="group-selfie-members" aria-label="Integrantes cargados">
            {groupSelfies.length === 0 && (
              <div className="group-selfie-empty">
                <strong>Agrega entre 1 y 5 selfies</strong>
                <small>Usa una selfie individual por integrante, con buena luz y rostro de frente.</small>
              </div>
            )}

            {groupSelfies.map((selfie, index) => (
              <article className={`group-selfie-member is-${selfie.status}`} key={selfie.id}>
                <img src={selfie.previewUrl} alt={`Selfie integrante ${index + 1}`} />
                <div>
                  <span>Integrante {index + 1}</span>
                  <strong>{selfieStatusLabel(selfie.status)}</strong>
                  <p>{selfie.message}</p>
                </div>
                <button type="button" onClick={() => removeSelfie(selfie.id)}>
                  Quitar
                </button>
              </article>
            ))}
          </div>

          <div className="group-selfie-submit">
            <button type="button" onClick={runGroupSearch} disabled={!canSearch}>
              {searchStatus === 'loading' ? 'Analizando posibles fotos...' : 'Buscar fotos del grupo'}
            </button>
            <small>{validSelfies.length} de {groupSelfies.length} selfies listas</small>
          </div>

          {searchStatus === 'loading' && (
            <div className="group-selfie-loading" aria-live="polite">
              <span />
              <div>
                <strong>{searchProgressLabel(searchProgress)}</strong>
                <div className="group-progress-track" aria-hidden="true">
                  <i style={{ width: `${searchProgressPercent(searchProgress)}%` }} />
                </div>
              </div>
            </div>
          )}

          {((searchStatus === 'loading' && groupResults.length > 0) || searchStatus === 'done' || searchStatus === 'error') && (
            <section className={`group-selfie-results ${searchStatus === 'error' ? 'is-error' : ''}`}>
              <small>Busqueda experimental</small>
              <h3>{showRecoveryCard ? 'No encontramos fotos claras todavia' : 'Encontramos posibles fotos de tu grupo'}</h3>
              {groupResults.length > 0 && (
                <>
                  <p>Revisa las fotos antes de comprar. El reconocimiento puede fallar si hay agua, lentes, poca luz o rostros de perfil.</p>
                  <p>No podemos asegurar que todas sean correctas. Revisa antes de comprar.</p>
                </>
              )}
              <strong>{searchMessage}</strong>

              {groupResults.length > 0 && (
                <GroupResultGrid
                  title="Fotos recomendadas de tu grupo"
                  results={groupResults}
                  selectedIds={selectedIds}
                  onOpenPhoto={onOpenPhoto}
                  onTogglePhoto={onTogglePhoto}
                  watermarkEnabled={watermarkEnabled}
                  selectedCount={selectedIds.length}
                  debugIAEnabled={debugIAEnabled}
                  isSearching={searchStatus === 'loading'}
                />
              )}

              {showRecoveryCard && (
                <GroupRecoveryCard
                  canAddMembers={canAddMembers}
                  canTakeSelfie={canStartCamera}
                  onTakeSelfie={startCamera}
                  onUploadSelfie={openFilePicker}
                  onShowGallery={scrollToFullGallery}
                  onClearSearch={clearGroupSearch}
                />
              )}
            </section>
          )}
        </div>
      )}
    </section>
  );
}

function GroupResultGrid({
  title,
  results,
  selectedIds,
  onOpenPhoto,
  onTogglePhoto,
  watermarkEnabled,
  selectedCount,
  debugIAEnabled,
  isSearching = false,
}) {
  const recommendedPhotoIds = results.map((result) => result.photo.id).filter(Boolean);
  const selectedRecommendedCount = recommendedPhotoIds.filter((id) => selectedIds.includes(id)).length;
  const allRecommendedSelected = recommendedPhotoIds.length > 0 && selectedRecommendedCount === recommendedPhotoIds.length;
  const hasSelectedRecommended = selectedRecommendedCount > 0;

  const selectRecommendedPhotos = () => {
    recommendedPhotoIds.forEach((photoId) => {
      if (!selectedIds.includes(photoId)) onTogglePhoto?.(photoId);
    });
  };

  const removeRecommendedPhotos = () => {
    recommendedPhotoIds.forEach((photoId) => {
      if (selectedIds.includes(photoId)) onTogglePhoto?.(photoId);
    });
  };

  return (
    <div className="group-result-section">
      <div className="group-result-heading">
        <h4>{title}</h4>
        <p>Selecciona tus favoritas y arma tu pedido.</p>
      </div>
      <SuggestedPackageCard
        recommendedCount={results.length}
        selectedCount={selectedCount}
      />
      <div className="group-quick-actions" aria-label="Acciones rapidas">
        <div>
          <strong>Acciones rapidas</strong>
          <p>
            {isSearching
              ? 'Las acciones rapidas estaran disponibles al terminar el analisis.'
              : 'Si las recomendaciones son correctas, podes seleccionarlas todas y ajustar tu pedido despues.'}
          </p>
        </div>
        <div className="group-quick-buttons">
          <button type="button" onClick={selectRecommendedPhotos} disabled={isSearching || allRecommendedSelected}>
            {allRecommendedSelected ? 'Recomendadas seleccionadas' : 'Seleccionar todas las recomendadas'}
          </button>
          <button type="button" className="ghost" onClick={removeRecommendedPhotos} disabled={isSearching || !hasSelectedRecommended}>
            Quitar recomendadas
          </button>
          <button type="button" className="ghost" onClick={scrollToFullGallery}>
            Ver galeria completa
          </button>
        </div>
      </div>
      <div className="group-selfie-results-grid">
        {results.map((result) => {
          const selected = selectedIds.includes(result.photo.id);
          return (
            <article className={`photo-card group-result-card ${selected ? 'selected' : ''}`} key={result.photo.id || result.photo.publicId || result.photo.thumbUrl}>
              <button className="photo-preview" type="button" onClick={() => onOpenPhoto?.(result.photo)}>
                <img src={result.photo.thumbUrl || result.photo.fullUrl} alt={`Posible foto de grupo ${result.photo.number}`} loading="lazy" />
                <span className="photo-preview-number">#{result.photo.number}</span>
                <span className="group-result-badge">{membersLabelFor(result.matchedMembersCount)}</span>
                <span className={`group-result-confidence is-${confidenceToneFor(result.bestDistance)}`}>
                  {result.confidenceLabel}
                </span>
                {watermarkEnabled && (
                  <span className="photo-watermark" aria-hidden="true">
                    <b>YakuExpress Preview</b>
                    <small>Vista previa</small>
                  </span>
                )}
              </button>
              {debugIAEnabled && (
                <GroupDebugPanel debugInfo={result.debugInfo} />
              )}
              <label className="photo-select">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onTogglePhoto?.(result.photo.id)}
                />
                <span>{selected ? 'Seleccionada' : 'Seleccionar foto'}</span>
              </label>
            </article>
          );
        })}
      </div>
      <p className="group-result-tip">Tip: si encontraste varias fotos, podes elegirlas y continuar con tu pedido.</p>
    </div>
  );
}

function GroupRecoveryCard({
  canAddMembers,
  canTakeSelfie,
  onTakeSelfie,
  onUploadSelfie,
  onShowGallery,
  onClearSearch,
}) {
  return (
    <div className="group-recovery-card" aria-label="Opciones para seguir buscando fotos">
      <div className="group-recovery-copy">
        <span aria-hidden="true">IA</span>
        <div>
          <h4>No encontramos fotos claras todavia</h4>
          <p>
            Proba con otra selfie de frente, con buena luz, o agrega otro integrante de tu grupo.
            Tambien podes revisar la galeria completa.
          </p>
          <small>Las selfies nitidas ayudan a encontrar mejores coincidencias.</small>
        </div>
      </div>

      <div className="group-recovery-tips" aria-label="Consejos para mejores selfies">
        <span>Rostro de frente</span>
        <span>Buena iluminacion</span>
        <span>Una persona por selfie</span>
        <span>Sin lentes oscuros si es posible</span>
      </div>

      {!canAddMembers && (
        <p className="group-recovery-limit">
          Ya agregaste el maximo de integrantes. Podes limpiar la busqueda y probar con selfies mas claras,
          o revisar la galeria completa.
        </p>
      )}

      <div className="group-recovery-actions">
        {canAddMembers && (
          <>
            <button type="button" onClick={onTakeSelfie} disabled={!canTakeSelfie}>
              Tomar otra selfie
            </button>
            <button type="button" className="ghost" onClick={onUploadSelfie}>
              Subir otra foto
            </button>
          </>
        )}
        <button type="button" className="ghost" onClick={onShowGallery}>
          Ver galeria completa
        </button>
        {!canAddMembers && (
          <button type="button" className="ghost" onClick={onClearSearch}>
            Limpiar busqueda
          </button>
        )}
      </div>
    </div>
  );
}

function GroupDebugPanel({ debugInfo }) {
  if (!debugInfo) return null;

  return (
    <div className="group-ai-debug" aria-label="Diagnostico IA">
      <strong>Diagnostico IA</strong>
      <span>Integrantes coincidentes: {debugInfo.matchedMembersCount}</span>
      <span>Mejor distancia: {formatDistance(debugInfo.bestDistance)}</span>
      <span>Confianza: {debugInfo.confidenceLevel}</span>
      <span>Rostros detectados: {debugInfo.detectedFacesCount}</span>
      <span>Coinciden: {debugInfo.matchedMembersLabel}</span>
      <span>Motivo: {debugInfo.recommendationReason}</span>
      <span>Fuente: {debugInfo.sourceUsed || 'sin dato'}</span>
      <span>Cache: {debugInfo.cacheHit ? 'si' : 'no'}</span>
      {Number.isInteger(debugInfo.originalIndex) && (
        <span>Indice original: {debugInfo.originalIndex}</span>
      )}
      {debugInfo.perMemberDistances.length > 0 && (
        <span>Distancias: {debugInfo.perMemberDistances.join(', ')}</span>
      )}
    </div>
  );
}

function SuggestedPackageCard({ recommendedCount, selectedCount }) {
  if (!recommendedCount) {
    return (
      <aside className="group-package-card" aria-label="Paquete sugerido">
        <div>
          <small>Paquete sugerido</small>
          <strong>Primero busca fotos recomendadas de tu grupo.</strong>
        </div>
      </aside>
    );
  }

  return (
    <aside className="group-package-card" aria-label="Paquete sugerido">
      <div>
        <small>Paquete sugerido</small>
        <strong>{packageMessageForRecommended(recommendedCount)}</strong>
        <p>{packageMessageForSelection(selectedCount)}</p>
      </div>
      <div className="group-package-chips" aria-label="Opciones de paquete">
        <span>8 fotos</span>
        <span>15 fotos</span>
      </div>
    </aside>
  );
}

function scrollToFullGallery() {
  document.querySelector('.photos-results')?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
}

function detectSelfieFaceDescriptors(faceapi, image) {
  return faceapi
    .detectAllFaces(image, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.35 }))
    .withFaceLandmarks(true)
    .withFaceDescriptors();
}

function detectGalleryFaceDescriptors(faceapi, image) {
  return faceapi
    .detectAllFaces(image, new faceapi.TinyFaceDetectorOptions({ inputSize: 608, scoreThreshold: 0.28 }))
    .withFaceLandmarks(true)
    .withFaceDescriptors();
}

async function getGalleryFaceDescriptors(faceapi, photo, photoDescriptorsCache) {
  const cacheKey = galleryPhotoCacheKey(photo);
  if (cacheKey && photoDescriptorsCache.has(cacheKey)) {
    return { ...photoDescriptorsCache.get(cacheKey), cacheHit: true };
  }

  const imageUrls = uniqueImageUrls([photo.fullUrl, photo.thumbUrl]);
  let detections = [];
  let sourceUsed = '';
  let lastError = null;

  for (const imageUrl of imageUrls) {
    try {
      const image = await loadRemoteImageElement(imageUrl);
      detections = await detectGalleryFaceDescriptors(faceapi, image);
      if (detections.length) {
        sourceUsed = sourceLabelFor(photo, imageUrl);
        break;
      }
    } catch (error) {
      lastError = error;
      console.warn('YakuExpress group search skipped image source:', error);
    }
  }

  const result = {
    detections,
    sourceUsed,
    error: detections.length ? null : lastError?.message || null,
  };
  if (cacheKey) photoDescriptorsCache.set(cacheKey, result);
  return { ...result, cacheHit: false };
}

function matchMembersAgainstGalleryFaces(faceapi, members, detections) {
  const possibleMatches = [];

  members.forEach((member) => {
    detections.forEach((detection, faceIndex) => {
      const distance = faceapi.euclideanDistance(member.descriptor, detection.descriptor);
      if (distance <= MAX_GROUP_DISTANCE) {
        possibleMatches.push({
          memberNumber: member.memberNumber,
          faceIndex,
          distance,
        });
      }
    });
  });

  possibleMatches.sort((left, right) => left.distance - right.distance);

  const usedMembers = new Set();
  const usedFaces = new Set();
  const matchedMembers = [];

  possibleMatches.forEach((match) => {
    if (usedMembers.has(match.memberNumber) || usedFaces.has(match.faceIndex)) return;
    usedMembers.add(match.memberNumber);
    usedFaces.add(match.faceIndex);
    matchedMembers.push({
      memberNumber: match.memberNumber,
      distance: match.distance,
    });
  });

  return matchedMembers.sort((left, right) => left.memberNumber - right.memberNumber);
}

function groupResultsByConfidence(results) {
  return results
    .filter((result) => (
      result.matchedMembersCount > 1 || result.bestDistance <= SINGLE_MEMBER_RECOMMENDED_DISTANCE
    ))
    .sort(compareRecommendedResults);
}

function createDebugInfo({
  matchedMembers,
  bestDistance,
  confidenceLabel,
  detectedFacesCount,
  sourceUsed,
  cacheHit,
  originalIndex,
}) {
  return {
    matchedMembersCount: matchedMembers.length,
    bestDistance,
    confidenceLabel,
    confidenceLevel: confidenceToneFor(bestDistance) === 'high' ? 'alta' : 'media',
    detectedFacesCount,
    matchedMembers: matchedMembers.map((member) => member.memberNumber),
    matchedMembersLabel: matchedMembers.map((member) => `Integrante ${member.memberNumber}`).join(', '),
    recommendationReason: recommendationReasonFor(matchedMembers.length, bestDistance),
    sourceUsed,
    cacheHit,
    originalIndex,
    perMemberDistances: matchedMembers.map((member) => (
      `I${member.memberNumber}: ${formatDistance(member.distance)}`
    )),
  };
}

function recommendationReasonFor(matchedMembersCount, bestDistance) {
  if (matchedMembersCount > 1) return 'Recomendada por coincidencia multiple';
  if (bestDistance <= 0.42) return 'Recomendada por coincidencia individual fuerte';
  return 'Recomendada por distancia media aceptada';
}

function formatDistance(distance) {
  if (!Number.isFinite(distance)) return 'sin dato';
  return distance.toFixed(3);
}

function compareRecommendedResults(left, right) {
  if (right.matchedMembersCount !== left.matchedMembersCount) {
    return right.matchedMembersCount - left.matchedMembersCount;
  }
  if (left.bestDistance !== right.bestDistance) {
    return left.bestDistance - right.bestDistance;
  }
  return left.originalIndex - right.originalIndex;
}

function groupResultsMessage(results) {
  if (results.length) {
    return `Encontramos ${results.length} fotos recomendadas de tu grupo.`;
  }
  return 'No encontramos coincidencias claras para este grupo. Proba con selfies mas iluminadas o revisa la galeria completa.';
}

function partialGroupResultsMessage(results) {
  if (!results.length) return '';
  return `Ya encontramos ${results.length} fotos recomendadas. Seguimos revisando la galeria.`;
}

function packageMessageForRecommended(count) {
  if (count <= 4) {
    return 'Encontramos algunas fotos recomendadas de tu grupo. Selecciona tus favoritas para armar tu pedido.';
  }
  if (count <= 8) {
    return 'Encontramos varias fotos buenas de tu grupo. Podes armar tu paquete de 8 fotos.';
  }
  if (count <= 15) {
    return 'Encontramos muchas fotos recomendadas. Te conviene revisar el paquete de 15 fotos.';
  }
  return 'Tu grupo tiene muchas fotos recomendadas. Selecciona tus favoritas y aprovecha el paquete de 15 fotos.';
}

function packageMessageForSelection(count) {
  if (!count) return 'Selecciona tus fotos favoritas para ver una recomendacion de paquete.';
  if (count <= 4) return `Ya seleccionaste ${count} fotos. Podes seguir agregando tus favoritas.`;
  if (count <= 7) return 'Estas cerca del paquete de 8 fotos.';
  if (count === 8) return 'Completaste un paquete de 8 fotos.';
  if (count <= 14) return 'Te conviene completar el paquete de 15 fotos.';
  if (count === 15) return 'Completaste un paquete de 15 fotos.';
  return 'Seleccionaste mas de 15 fotos. Revisa tus favoritas antes de continuar.';
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
      reject(new Error('No se pudo leer la selfie.'));
    };
    image.src = imageUrl;
  });
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

function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92);
  });
}

function waitForVideoMetadata(video, signal) {
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Camera session cancelled', 'AbortError'));
      return;
    }

    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('VideoMetadataTimeout'));
    }, 6000);

    const onReady = () => {
      if (video.videoWidth <= 0 || video.videoHeight <= 0) return;
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error('VideoMetadataError'));
    };

    const onAbort = () => {
      cleanup();
      reject(new DOMException('Camera session cancelled', 'AbortError'));
    };

    function cleanup() {
      window.clearTimeout(timeoutId);
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    }

    video.addEventListener('loadedmetadata', onReady);
    video.addEventListener('loadeddata', onReady);
    video.addEventListener('canplay', onReady);
    video.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function waitForCameraFrame(video, signal, frameRequestRef) {
  if (hasCameraFrame(video)) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Camera session cancelled', 'AbortError'));
      return;
    }

    const startedAt = Date.now();

    const cleanup = () => {
      if (frameRequestRef?.current) {
        window.cancelAnimationFrame(frameRequestRef.current);
        frameRequestRef.current = null;
      }
      signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      cleanup();
      reject(new DOMException('Camera session cancelled', 'AbortError'));
    };

    const checkFrame = () => {
      if (signal?.aborted) {
        onAbort();
        return;
      }
      if (hasCameraFrame(video)) {
        cleanup();
        resolve();
        return;
      }
      if (Date.now() - startedAt > 4000) {
        cleanup();
        reject(new Error('VideoFrameTimeout'));
        return;
      }
      frameRequestRef.current = window.requestAnimationFrame(checkFrame);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    frameRequestRef.current = window.requestAnimationFrame(checkFrame);
  });
}

function hasCameraFrame(video) {
  return Boolean(video && video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2);
}

function cameraErrorMessage(error) {
  if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') {
    return 'La camara esta siendo utilizada por otra aplicacion. Cerrala y volve a intentar.';
  }
  return 'No pudimos abrir la camara. Revisa el permiso de camara o subi una foto desde tus archivos.';
}

function confidenceLabelFor(distance) {
  if (distance <= 0.42) return 'Coincidencia alta';
  return 'Coincidencia media';
}

function confidenceToneFor(distance) {
  if (distance <= 0.42) return 'high';
  return 'medium';
}

function membersLabelFor(count) {
  if (count > 1) return `Aparecen ${count} integrantes`;
  return 'Coincide con 1 integrante';
}

function selfieStatusLabel(status) {
  if (status === 'valid') return 'Rostro detectado';
  if (status === 'error') return 'Revisar selfie';
  return 'Buscando rostro...';
}

function createLocalId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `group-selfie-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createGalleryCacheSignature(photos) {
  return photos.map((photo, index) => galleryPhotoCacheKey(photo) || `photo-${index}`).join('|');
}

function resultPhotoKey(photo, index) {
  return galleryPhotoCacheKey(photo) || `photo-${index}`;
}

function galleryPhotoCacheKey(photo) {
  return photo.id || photo.publicId || photo.public_id || photo.url || photo.fullUrl || photo.thumbUrl;
}

function isBackgroundPrecacheComplete(photos, cache) {
  return photos
    .slice(0, BACKGROUND_PRECACHE_LIMIT)
    .every((photo) => {
      const cacheKey = galleryPhotoCacheKey(photo);
      return cacheKey && cache.has(cacheKey);
    });
}

function uniqueImageUrls(imageUrls) {
  return imageUrls.filter((imageUrl, index) => imageUrl && imageUrls.indexOf(imageUrl) === index);
}

function sourceLabelFor(photo, imageUrl) {
  if (photo.fullUrl && imageUrl === photo.fullUrl) return 'fullUrl';
  if (photo.thumbUrl && imageUrl === photo.thumbUrl && photo.fullUrl) return 'thumbUrl fallback';
  if (photo.thumbUrl && imageUrl === photo.thumbUrl) return 'thumbUrl';
  return 'desconocida';
}

function isDebugIAEnabled() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('debugIA') === '1';
}

function searchProgressLabel(progress) {
  if (!progress?.total) return 'Analizando posibles fotos del grupo...';
  return `Analizando fotos del grupo... ${progress.current} de ${progress.total}`;
}

function searchProgressPercent(progress) {
  if (!progress?.total) return 0;
  return Math.min(100, Math.round((progress.current / progress.total) * 100));
}

function releaseUiThread() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function waitForDelay(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function waitForBackgroundPrecache() {
  return new Promise((resolve) => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(resolve, { timeout: BACKGROUND_PRECACHE_PAUSE_MS });
      return;
    }
    window.setTimeout(resolve, BACKGROUND_PRECACHE_PAUSE_MS);
  });
}
