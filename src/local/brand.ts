/* Brand dei documenti. Stessa grafica per tutti (design system OpenEconomics): cambiano logo e colori.
   - OpenEconomics: Bluette + Lime.
   - Civiqa: tema .theme-civiqa del DS (colors_and_type.css): la rampa Bluette diventa il Blu Civiqa,
     il Lime diventa blu, testo bianco sul blu e blu chiaro come accento sul fondo scuro.
   - T33 («An OpenEconomics Company»): palette del template Word T33 (Bluette #4400B3, viola scuro #270065, Lime),
     logo T·33; come marchio di pagina usa il cerchio OpenEconomics, come la carta intestata T33. */
import type { Brand } from '../types'

export interface BrandDef {
  id: Brand
  label: string
  note: string
  /** nome mostrato nel titolo della scheda del PDF */
  name: string
  /** cartella dei loghi dentro render/logos/ ('' = OpenEconomics) */
  dir: string
  vars: Record<string, string>
  /** colori per l'anteprima nella scelta del brand */
  swatch: string[]
}

const OE_RAMP = {
  '--b900': '#270065', '--b800': '#340088', '--b700': '#4400B3', '--b600': '#5902EE', '--b500': '#6E1AFF',
  '--b400': '#8742FF', '--b300': '#A16AFF', '--b200': '#B991FF', '--b100': '#D9C1FF', '--b050': '#EFE5FF',
}

export const BRANDS: Record<Brand, BrandDef> = {
  oe: {
    id: 'oe', label: 'OpenEconomics', name: 'OpenEconomics', dir: '',
    note: 'Bluette e Lime, logo OpenEconomics',
    vars: { ...OE_RAMP, '--lime': '#B9FF69', '--pop-on': '#000000', '--chip-ink': '#4400B3', '--on-dark': '#B9FF69', '--dark-ink': '#4400B3', '--shade': '39,0,101' },
    swatch: ['#4400B3', '#B9FF69', '#270065'],
  },
  civiqa: {
    id: 'civiqa', label: 'Civiqa', name: 'Civiqa', dir: 'civiqa/',
    note: 'Blu elettrico, logo Civiqa',
    vars: {
      '--b900': '#000035', '--b800': '#000068', '--b700': '#0000FF', '--b600': '#0000FF', '--b500': '#3A3AFF',
      '--b400': '#6161FF', '--b300': '#9696FF', '--b200': '#B6B6FF', '--b100': '#D5D5FF', '--b050': '#F1F1FF',
      '--lime': '#0000FF', '--pop-on': '#FFFFFF', '--chip-ink': '#FFFFFF', '--on-dark': '#B6B6FF', '--dark-ink': '#000035', '--shade': '0,0,53',
    },
    swatch: ['#0000FF', '#B6B6FF', '#000035'],
  },
  t33: {
    id: 't33', label: 'T33', name: 'T33', dir: 't33/',
    note: 'An OpenEconomics Company: Bluette e viola scuro, logo T·33',
    vars: { ...OE_RAMP, '--lime': '#B9FF69', '--pop-on': '#000000', '--chip-ink': '#4400B3', '--on-dark': '#B9FF69', '--dark-ink': '#4400B3', '--shade': '39,0,101' },
    swatch: ['#4400B3', '#270065', '#B9FF69'],
  },
}

export const brandOf = (b?: Brand | null): BrandDef => BRANDS[b ?? 'oe'] ?? BRANDS.oe

/** Variabili CSS del brand, da mettere dopo il CSS del modello. */
export const brandCss = (b: BrandDef) => `:root{${Object.entries(b.vars).map(([k, v]) => `${k}:${v}`).join(';')}}`
