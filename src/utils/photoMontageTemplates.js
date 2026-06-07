export const PHOTO_MONTAGE_TEMPLATES = [
  {
    id: 'giant-wave',
    name: 'Ola gigante',
    description: 'Una composicion heroica con energia de ola, espuma y aventura acuática.',
    type: 'wave',
    accentLabel: 'Aventura intensa',
  },
  {
    id: 'dolphins',
    name: 'Delfines',
    description: 'Un recuerdo alegre con siluetas marinas, burbujas y movimiento suave.',
    type: 'dolphins',
    accentLabel: 'Recuerdo familiar',
  },
  {
    id: 'sunset',
    name: 'Atardecer marino',
    description: 'Un look cálido de atardecer con brillo premium y ambiente de verano.',
    type: 'sunset',
    accentLabel: 'Postal premium',
  },
];

export function getPhotoMontageTemplate(templateId) {
  return PHOTO_MONTAGE_TEMPLATES.find((template) => template.id === templateId) || PHOTO_MONTAGE_TEMPLATES[0];
}