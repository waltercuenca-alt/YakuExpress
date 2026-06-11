export const PHOTO_MONTAGE_TEMPLATES = [
  {
    id: 'souvenir-yakupark',
    name: 'Souvenir Yakupark 1',
    description: 'Un recuerdo acuatico con marco, olas y sello Yakupark.',
    type: 'souvenir',
    accentLabel: 'Souvenir',
    backgroundUrl: '/photo-montages/backgrounds/souvenir-yakupark-bg.png',
    overlayUrl: '/photo-montages/overlays/souvenir-yakupark-overlay.png',
  },
  {
    id: 'souvenir-yakupark-2',
    name: 'Souvenir Yakupark 2',
    description: 'Una variante premium con un marco Yakupark diferente.',
    type: 'souvenir',
    accentLabel: 'Souvenir',
    backgroundUrl: '/photo-montages/backgrounds/souvenir-yakupark-bg.png',
    overlayUrl: '/photo-montages/overlays/souvenir-yakupark-overlay1.png',
  },
  {
    id: 'souvenir-yakupark-3',
    name: 'Souvenir Yakupark 3',
    description: 'Una variante premium con un marco Yakupark diferente.',
    type: 'souvenir',
    accentLabel: 'Souvenir',
    backgroundUrl: '/photo-montages/backgrounds/souvenir-yakupark-bg.png',
    overlayUrl: '/photo-montages/overlays/souvenir-yakupark-overlay2.png',
  },
  {
    id: 'souvenir-yakupark-4',
    name: 'Souvenir Yakupark 4',
    description: 'Una variante premium con un marco Yakupark diferente.',
    type: 'souvenir',
    accentLabel: 'Souvenir',
    backgroundUrl: '/photo-montages/backgrounds/souvenir-yakupark-bg.png',
    overlayUrl: '/photo-montages/overlays/souvenir-yakupark-overlay4.png',
  },
  {
    id: 'souvenir-yakupark-5',
    name: 'Souvenir Yakupark 5',
    description: 'Una variante premium con un marco Yakupark diferente.',
    type: 'souvenir',
    accentLabel: 'Souvenir',
    backgroundUrl: '/photo-montages/backgrounds/souvenir-yakupark-bg.png',
    overlayUrl: '/photo-montages/overlays/souvenir-yakupark-overlay5.png',
  },
];

export function getPhotoMontageTemplate(templateId) {
  return PHOTO_MONTAGE_TEMPLATES.find((template) => template.id === templateId) || PHOTO_MONTAGE_TEMPLATES[0];
}

