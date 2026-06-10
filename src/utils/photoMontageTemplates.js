export const PHOTO_MONTAGE_TEMPLATES = [
  {
    id: 'souvenir-yakupark',
    name: 'Souvenir Yakupark',
    description: 'Un recuerdo acuatico con marco, olas y sello Yakupark.',
    type: 'souvenir',
    accentLabel: 'Souvenir',
    backgroundUrl: '/photo-montages/backgrounds/souvenir-yakupark-bg.png',
    overlayUrl: '/photo-montages/overlays/souvenir-yakupark-overlay.png',
  },
  {
    id: 'giant-wave',
    name: 'Ola gigante',
    description: 'Una composicion heroica con energia de ola, espuma y aventura acuática.',
    type: 'wave',
    accentLabel: 'Aventura intensa',
    backgroundUrl: '/photo-montages/backgrounds/ola-gigante.jpg',
  },
  {
    id: 'dolphins',
    name: 'Delfines',
    description: 'Un recuerdo alegre con siluetas marinas, burbujas y movimiento suave.',
    type: 'dolphins',
    accentLabel: 'Recuerdo familiar',
    backgroundUrl: '/photo-montages/backgrounds/delfines.jpg',
  },
  {
    id: 'sunset',
    name: 'Atardecer marino',
    description: 'Un look cálido de atardecer con brillo premium y ambiente de verano.',
    type: 'sunset',
    accentLabel: 'Postal premium',
    backgroundUrl: '/photo-montages/backgrounds/atardecer-marino.jpg',
  },
  {
    id: 'custom-background-1',
    name: 'Fondo premium 1',
    description: 'Fondo real preparado para montaje premium.',
    type: 'premium',
    accentLabel: 'Nuevo',
    backgroundUrl: '/photo-montages/backgrounds/fondo1.png',
  },
  {
    id: 'custom-background-2',
    name: 'Fondo premium 2',
    description: 'Fondo real preparado para montaje premium.',
    type: 'premium',
    accentLabel: 'Nuevo',
    backgroundUrl: '/photo-montages/backgrounds/fondo2.png',
  },
];

export function getPhotoMontageTemplate(templateId) {
  return PHOTO_MONTAGE_TEMPLATES.find((template) => template.id === templateId) || PHOTO_MONTAGE_TEMPLATES[0];
}

