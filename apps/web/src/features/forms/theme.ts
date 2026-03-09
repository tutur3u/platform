import type { FormThemeInput } from './schema';

type FormAccentTone = FormThemeInput['accentColor'];

export interface FormToneClasses {
  cardClassName: string;
  checkboxClassName: string;
  fieldClassName: string;
  heroClassName: string;
  iconClassName: string;
  optionCardClassName: string;
  pageClassName: string;
  primaryButtonClassName: string;
  progressClassName: string;
  progressIndicatorClassName: string;
  previewClassName: string;
  radioClassName: string;
  secondaryButtonClassName: string;
  selectedOptionClassName: string;
  tabListClassName: string;
  tabTriggerClassName: string;
}

export interface FormThemePreset {
  id: string;
  name: string;
  kicker: string;
  accentColor: FormAccentTone;
  headlineFontId: FormThemeInput['headlineFontId'];
  bodyFontId: FormThemeInput['bodyFontId'];
  surfaceStyle: FormThemeInput['surfaceStyle'];
}

export const FORM_ACCENT_BADGE_CLASSES: Record<FormAccentTone, string> = {
  'dynamic-blue': 'bg-dynamic-blue',
  'dynamic-cyan': 'bg-dynamic-cyan',
  'dynamic-gray': 'bg-dynamic-gray',
  'dynamic-green': 'bg-dynamic-green',
  'dynamic-indigo': 'bg-dynamic-indigo',
  'dynamic-orange': 'bg-dynamic-orange',
  'dynamic-pink': 'bg-dynamic-pink',
  'dynamic-purple': 'bg-dynamic-purple',
  'dynamic-red': 'bg-dynamic-red',
  'dynamic-yellow': 'bg-dynamic-yellow',
};

export const FORM_PRESET_PALETTES: Record<
  FormThemePreset['id'],
  FormAccentTone[]
> = {
  'amber-pulse': ['dynamic-yellow', 'dynamic-orange', 'dynamic-red'],
  'coastal-notes': ['dynamic-blue', 'dynamic-cyan', 'dynamic-green'],
  'editorial-moss': ['dynamic-green', 'dynamic-yellow', 'dynamic-gray'],
  'fjord-grid': ['dynamic-blue', 'dynamic-indigo', 'dynamic-gray'],
  'graph-paper': ['dynamic-gray', 'dynamic-blue', 'dynamic-cyan'],
  'linen-story': ['dynamic-yellow', 'dynamic-gray', 'dynamic-green'],
  'mint-terminal': ['dynamic-green', 'dynamic-cyan', 'dynamic-gray'],
  'indigo-brief': ['dynamic-indigo', 'dynamic-blue', 'dynamic-gray'],
  'orchard-brief': ['dynamic-green', 'dynamic-orange', 'dynamic-yellow'],
  'night-ledger': ['dynamic-cyan', 'dynamic-blue', 'dynamic-indigo'],
  'solar-metric': ['dynamic-orange', 'dynamic-yellow', 'dynamic-blue'],
  'rose-ritual': ['dynamic-pink', 'dynamic-purple', 'dynamic-red'],
  'signal-coral': ['dynamic-orange', 'dynamic-red', 'dynamic-yellow'],
  'terracotta-ledger': ['dynamic-red', 'dynamic-orange', 'dynamic-yellow'],
  'studio-sand': ['dynamic-gray', 'dynamic-yellow', 'dynamic-orange'],
  'velvet-signal': ['dynamic-purple', 'dynamic-pink', 'dynamic-indigo'],
};

const TONE_CLASS_MAP: Record<FormAccentTone, FormToneClasses> = {
  'dynamic-blue': {
    cardClassName:
      'border-dynamic-blue/20 bg-background/90 shadow-xl shadow-dynamic-blue/10',
    checkboxClassName:
      'border-dynamic-blue/35 focus-visible:outline-dynamic-blue/40 focus-visible:ring-dynamic-blue/15 data-[state=checked]:border-dynamic-blue data-[state=checked]:bg-dynamic-blue data-[state=indeterminate]:border-dynamic-blue data-[state=indeterminate]:bg-dynamic-blue/80 data-[state=checked]:text-background data-[state=indeterminate]:text-background',
    fieldClassName:
      'border-border/60 bg-background/80 focus-visible:outline-dynamic-blue/40 focus-visible:ring-dynamic-blue/15',
    heroClassName:
      'border-dynamic-blue/25 bg-linear-to-br from-dynamic-blue/15 via-background/95 to-dynamic-cyan/10',
    iconClassName:
      'border border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue',
    optionCardClassName:
      'border-border/60 bg-background/70 hover:border-dynamic-blue/35',
    pageClassName:
      'bg-linear-to-b from-background via-dynamic-blue/5 to-dynamic-cyan/10',
    primaryButtonClassName:
      'border border-dynamic-blue/30 bg-dynamic-blue/12 text-dynamic-blue hover:bg-dynamic-blue/18',
    progressClassName: 'bg-dynamic-blue/10',
    progressIndicatorClassName: 'bg-dynamic-blue',
    previewClassName:
      'border-dynamic-blue/30 bg-linear-to-br from-dynamic-blue/20 to-dynamic-cyan/10',
    radioClassName:
      'border-dynamic-blue/35 text-dynamic-blue focus-visible:outline-dynamic-blue/40 focus-visible:ring-dynamic-blue/15 [&_svg]:fill-dynamic-blue',
    secondaryButtonClassName:
      'border border-dynamic-blue/20 bg-background/80 hover:border-dynamic-blue/35 hover:bg-dynamic-blue/8',
    selectedOptionClassName:
      'border-dynamic-blue bg-dynamic-blue/15 text-dynamic-blue shadow-sm shadow-dynamic-blue/15',
    tabListClassName: 'border border-dynamic-blue/15 bg-background/70',
    tabTriggerClassName:
      'rounded-xl data-[state=active]:border data-[state=active]:border-dynamic-blue/30 data-[state=active]:bg-dynamic-blue/12 data-[state=active]:text-dynamic-blue',
  },
  'dynamic-cyan': {
    cardClassName:
      'border-dynamic-cyan/20 bg-background/90 shadow-xl shadow-dynamic-cyan/10',
    checkboxClassName:
      'border-dynamic-cyan/35 focus-visible:outline-dynamic-cyan/40 focus-visible:ring-dynamic-cyan/15 data-[state=checked]:border-dynamic-cyan data-[state=checked]:bg-dynamic-cyan data-[state=indeterminate]:border-dynamic-cyan data-[state=indeterminate]:bg-dynamic-cyan/80 data-[state=checked]:text-background data-[state=indeterminate]:text-background',
    fieldClassName:
      'border-border/60 bg-background/80 focus-visible:outline-dynamic-cyan/40 focus-visible:ring-dynamic-cyan/15',
    heroClassName:
      'border-dynamic-cyan/25 bg-linear-to-br from-dynamic-cyan/15 via-background/95 to-dynamic-blue/10',
    iconClassName:
      'border border-dynamic-cyan/30 bg-dynamic-cyan/10 text-dynamic-cyan',
    optionCardClassName:
      'border-border/60 bg-background/70 hover:border-dynamic-cyan/35',
    pageClassName:
      'bg-linear-to-b from-background via-dynamic-cyan/5 to-dynamic-blue/10',
    primaryButtonClassName:
      'border border-dynamic-cyan/30 bg-dynamic-cyan/12 text-dynamic-cyan hover:bg-dynamic-cyan/18',
    progressClassName: 'bg-dynamic-cyan/10',
    progressIndicatorClassName: 'bg-dynamic-cyan',
    previewClassName:
      'border-dynamic-cyan/30 bg-linear-to-br from-dynamic-cyan/20 to-dynamic-blue/10',
    radioClassName:
      'border-dynamic-cyan/35 text-dynamic-cyan focus-visible:outline-dynamic-cyan/40 focus-visible:ring-dynamic-cyan/15 [&_svg]:fill-dynamic-cyan',
    secondaryButtonClassName:
      'border border-dynamic-cyan/20 bg-background/80 hover:border-dynamic-cyan/35 hover:bg-dynamic-cyan/8',
    selectedOptionClassName:
      'border-dynamic-cyan bg-dynamic-cyan/15 text-dynamic-cyan shadow-sm shadow-dynamic-cyan/15',
    tabListClassName: 'border border-dynamic-cyan/15 bg-background/70',
    tabTriggerClassName:
      'rounded-xl data-[state=active]:border data-[state=active]:border-dynamic-cyan/30 data-[state=active]:bg-dynamic-cyan/12 data-[state=active]:text-dynamic-cyan',
  },
  'dynamic-gray': {
    cardClassName:
      'border-dynamic-gray/20 bg-background/90 shadow-xl shadow-dynamic-gray/10',
    checkboxClassName:
      'border-dynamic-gray/35 focus-visible:outline-dynamic-gray/40 focus-visible:ring-dynamic-gray/15 data-[state=checked]:border-dynamic-gray data-[state=checked]:bg-dynamic-gray data-[state=indeterminate]:border-dynamic-gray data-[state=indeterminate]:bg-dynamic-gray/80 data-[state=checked]:text-background data-[state=indeterminate]:text-background',
    fieldClassName:
      'border-border/60 bg-background/80 focus-visible:outline-dynamic-gray/40 focus-visible:ring-dynamic-gray/15',
    heroClassName:
      'border-dynamic-gray/25 bg-linear-to-br from-dynamic-gray/12 via-background/95 to-dynamic-gray/5',
    iconClassName:
      'border border-dynamic-gray/30 bg-dynamic-gray/10 text-dynamic-gray',
    optionCardClassName:
      'border-border/60 bg-background/70 hover:border-dynamic-gray/35',
    pageClassName:
      'bg-linear-to-b from-background via-dynamic-gray/5 to-dynamic-gray/10',
    primaryButtonClassName:
      'border border-dynamic-gray/30 bg-dynamic-gray/12 text-foreground hover:bg-dynamic-gray/18',
    progressClassName: 'bg-dynamic-gray/10',
    progressIndicatorClassName: 'bg-dynamic-gray',
    previewClassName:
      'border-dynamic-gray/30 bg-linear-to-br from-dynamic-gray/20 to-dynamic-gray/10',
    radioClassName:
      'border-dynamic-gray/35 text-foreground focus-visible:outline-dynamic-gray/40 focus-visible:ring-dynamic-gray/15 [&_svg]:fill-dynamic-gray',
    secondaryButtonClassName:
      'border border-dynamic-gray/20 bg-background/80 hover:border-dynamic-gray/35 hover:bg-dynamic-gray/8',
    selectedOptionClassName:
      'border-dynamic-gray bg-dynamic-gray/15 text-foreground shadow-sm shadow-dynamic-gray/15',
    tabListClassName: 'border border-dynamic-gray/15 bg-background/70',
    tabTriggerClassName:
      'rounded-xl data-[state=active]:border data-[state=active]:border-dynamic-gray/30 data-[state=active]:bg-dynamic-gray/12 data-[state=active]:text-foreground',
  },
  'dynamic-green': {
    cardClassName:
      'border-dynamic-green/20 bg-background/90 shadow-xl shadow-dynamic-green/10',
    checkboxClassName:
      'border-dynamic-green/35 focus-visible:outline-dynamic-green/40 focus-visible:ring-dynamic-green/15 data-[state=checked]:border-dynamic-green data-[state=checked]:bg-dynamic-green data-[state=indeterminate]:border-dynamic-green data-[state=indeterminate]:bg-dynamic-green/80 data-[state=checked]:text-background data-[state=indeterminate]:text-background',
    fieldClassName:
      'border-border/60 bg-background/80 focus-visible:outline-dynamic-green/40 focus-visible:ring-dynamic-green/15',
    heroClassName:
      'border-dynamic-green/25 bg-linear-to-br from-dynamic-green/15 via-background/95 to-dynamic-yellow/10',
    iconClassName:
      'border border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green',
    optionCardClassName:
      'border-border/60 bg-background/70 hover:border-dynamic-green/35',
    pageClassName:
      'bg-linear-to-b from-background via-dynamic-green/5 to-dynamic-yellow/10',
    primaryButtonClassName:
      'border border-dynamic-green/30 bg-dynamic-green/12 text-dynamic-green hover:bg-dynamic-green/18',
    progressClassName: 'bg-dynamic-green/10',
    progressIndicatorClassName: 'bg-dynamic-green',
    previewClassName:
      'border-dynamic-green/30 bg-linear-to-br from-dynamic-green/20 to-dynamic-yellow/10',
    radioClassName:
      'border-dynamic-green/35 text-dynamic-green focus-visible:outline-dynamic-green/40 focus-visible:ring-dynamic-green/15 [&_svg]:fill-dynamic-green',
    secondaryButtonClassName:
      'border border-dynamic-green/20 bg-background/80 hover:border-dynamic-green/35 hover:bg-dynamic-green/8',
    selectedOptionClassName:
      'border-dynamic-green bg-dynamic-green/15 text-dynamic-green shadow-sm shadow-dynamic-green/15',
    tabListClassName: 'border border-dynamic-green/15 bg-background/70',
    tabTriggerClassName:
      'rounded-xl data-[state=active]:border data-[state=active]:border-dynamic-green/30 data-[state=active]:bg-dynamic-green/12 data-[state=active]:text-dynamic-green',
  },
  'dynamic-indigo': {
    cardClassName:
      'border-dynamic-indigo/20 bg-background/90 shadow-xl shadow-dynamic-indigo/10',
    checkboxClassName:
      'border-dynamic-indigo/35 focus-visible:outline-dynamic-indigo/40 focus-visible:ring-dynamic-indigo/15 data-[state=checked]:border-dynamic-indigo data-[state=checked]:bg-dynamic-indigo data-[state=indeterminate]:border-dynamic-indigo data-[state=indeterminate]:bg-dynamic-indigo/80 data-[state=checked]:text-background data-[state=indeterminate]:text-background',
    fieldClassName:
      'border-border/60 bg-background/80 focus-visible:outline-dynamic-indigo/40 focus-visible:ring-dynamic-indigo/15',
    heroClassName:
      'border-dynamic-indigo/25 bg-linear-to-br from-dynamic-indigo/15 via-background/95 to-dynamic-purple/10',
    iconClassName:
      'border border-dynamic-indigo/30 bg-dynamic-indigo/10 text-dynamic-indigo',
    optionCardClassName:
      'border-border/60 bg-background/70 hover:border-dynamic-indigo/35',
    pageClassName:
      'bg-linear-to-b from-background via-dynamic-indigo/5 to-dynamic-purple/10',
    primaryButtonClassName:
      'border border-dynamic-indigo/30 bg-dynamic-indigo/12 text-dynamic-indigo hover:bg-dynamic-indigo/18',
    progressClassName: 'bg-dynamic-indigo/10',
    progressIndicatorClassName: 'bg-dynamic-indigo',
    previewClassName:
      'border-dynamic-indigo/30 bg-linear-to-br from-dynamic-indigo/20 to-dynamic-purple/10',
    radioClassName:
      'border-dynamic-indigo/35 text-dynamic-indigo focus-visible:outline-dynamic-indigo/40 focus-visible:ring-dynamic-indigo/15 [&_svg]:fill-dynamic-indigo',
    secondaryButtonClassName:
      'border border-dynamic-indigo/20 bg-background/80 hover:border-dynamic-indigo/35 hover:bg-dynamic-indigo/8',
    selectedOptionClassName:
      'border-dynamic-indigo bg-dynamic-indigo/15 text-dynamic-indigo shadow-sm shadow-dynamic-indigo/15',
    tabListClassName: 'border border-dynamic-indigo/15 bg-background/70',
    tabTriggerClassName:
      'rounded-xl data-[state=active]:border data-[state=active]:border-dynamic-indigo/30 data-[state=active]:bg-dynamic-indigo/12 data-[state=active]:text-dynamic-indigo',
  },
  'dynamic-orange': {
    cardClassName:
      'border-dynamic-orange/20 bg-background/90 shadow-xl shadow-dynamic-orange/10',
    checkboxClassName:
      'border-dynamic-orange/35 focus-visible:outline-dynamic-orange/40 focus-visible:ring-dynamic-orange/15 data-[state=checked]:border-dynamic-orange data-[state=checked]:bg-dynamic-orange data-[state=indeterminate]:border-dynamic-orange data-[state=indeterminate]:bg-dynamic-orange/80 data-[state=checked]:text-background data-[state=indeterminate]:text-background',
    fieldClassName:
      'border-border/60 bg-background/80 focus-visible:outline-dynamic-orange/40 focus-visible:ring-dynamic-orange/15',
    heroClassName:
      'border-dynamic-orange/25 bg-linear-to-br from-dynamic-orange/15 via-background/95 to-dynamic-yellow/10',
    iconClassName:
      'border border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange',
    optionCardClassName:
      'border-border/60 bg-background/70 hover:border-dynamic-orange/35',
    pageClassName:
      'bg-linear-to-b from-background via-dynamic-orange/5 to-dynamic-yellow/10',
    primaryButtonClassName:
      'border border-dynamic-orange/30 bg-dynamic-orange/12 text-dynamic-orange hover:bg-dynamic-orange/18',
    progressClassName: 'bg-dynamic-orange/10',
    progressIndicatorClassName: 'bg-dynamic-orange',
    previewClassName:
      'border-dynamic-orange/30 bg-linear-to-br from-dynamic-orange/20 to-dynamic-yellow/10',
    radioClassName:
      'border-dynamic-orange/35 text-dynamic-orange focus-visible:outline-dynamic-orange/40 focus-visible:ring-dynamic-orange/15 [&_svg]:fill-dynamic-orange',
    secondaryButtonClassName:
      'border border-dynamic-orange/20 bg-background/80 hover:border-dynamic-orange/35 hover:bg-dynamic-orange/8',
    selectedOptionClassName:
      'border-dynamic-orange bg-dynamic-orange/15 text-dynamic-orange shadow-sm shadow-dynamic-orange/15',
    tabListClassName: 'border border-dynamic-orange/15 bg-background/70',
    tabTriggerClassName:
      'rounded-xl data-[state=active]:border data-[state=active]:border-dynamic-orange/30 data-[state=active]:bg-dynamic-orange/12 data-[state=active]:text-dynamic-orange',
  },
  'dynamic-pink': {
    cardClassName:
      'border-dynamic-pink/20 bg-background/90 shadow-xl shadow-dynamic-pink/10',
    checkboxClassName:
      'border-dynamic-pink/35 focus-visible:outline-dynamic-pink/40 focus-visible:ring-dynamic-pink/15 data-[state=checked]:border-dynamic-pink data-[state=checked]:bg-dynamic-pink data-[state=indeterminate]:border-dynamic-pink data-[state=indeterminate]:bg-dynamic-pink/80 data-[state=checked]:text-background data-[state=indeterminate]:text-background',
    fieldClassName:
      'border-border/60 bg-background/80 focus-visible:outline-dynamic-pink/40 focus-visible:ring-dynamic-pink/15',
    heroClassName:
      'border-dynamic-pink/25 bg-linear-to-br from-dynamic-pink/15 via-background/95 to-dynamic-purple/10',
    iconClassName:
      'border border-dynamic-pink/30 bg-dynamic-pink/10 text-dynamic-pink',
    optionCardClassName:
      'border-border/60 bg-background/70 hover:border-dynamic-pink/35',
    pageClassName:
      'bg-linear-to-b from-background via-dynamic-pink/5 to-dynamic-purple/10',
    primaryButtonClassName:
      'border border-dynamic-pink/30 bg-dynamic-pink/12 text-dynamic-pink hover:bg-dynamic-pink/18',
    progressClassName: 'bg-dynamic-pink/10',
    progressIndicatorClassName: 'bg-dynamic-pink',
    previewClassName:
      'border-dynamic-pink/30 bg-linear-to-br from-dynamic-pink/20 to-dynamic-purple/10',
    radioClassName:
      'border-dynamic-pink/35 text-dynamic-pink focus-visible:outline-dynamic-pink/40 focus-visible:ring-dynamic-pink/15 [&_svg]:fill-dynamic-pink',
    secondaryButtonClassName:
      'border border-dynamic-pink/20 bg-background/80 hover:border-dynamic-pink/35 hover:bg-dynamic-pink/8',
    selectedOptionClassName:
      'border-dynamic-pink bg-dynamic-pink/15 text-dynamic-pink shadow-sm shadow-dynamic-pink/15',
    tabListClassName: 'border border-dynamic-pink/15 bg-background/70',
    tabTriggerClassName:
      'rounded-xl data-[state=active]:border data-[state=active]:border-dynamic-pink/30 data-[state=active]:bg-dynamic-pink/12 data-[state=active]:text-dynamic-pink',
  },
  'dynamic-purple': {
    cardClassName:
      'border-dynamic-purple/20 bg-background/90 shadow-xl shadow-dynamic-purple/10',
    checkboxClassName:
      'border-dynamic-purple/35 focus-visible:outline-dynamic-purple/40 focus-visible:ring-dynamic-purple/15 data-[state=checked]:border-dynamic-purple data-[state=checked]:bg-dynamic-purple data-[state=indeterminate]:border-dynamic-purple data-[state=indeterminate]:bg-dynamic-purple/80 data-[state=checked]:text-background data-[state=indeterminate]:text-background',
    fieldClassName:
      'border-border/60 bg-background/80 focus-visible:outline-dynamic-purple/40 focus-visible:ring-dynamic-purple/15',
    heroClassName:
      'border-dynamic-purple/25 bg-linear-to-br from-dynamic-purple/15 via-background/95 to-dynamic-pink/10',
    iconClassName:
      'border border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple',
    optionCardClassName:
      'border-border/60 bg-background/70 hover:border-dynamic-purple/35',
    pageClassName:
      'bg-linear-to-b from-background via-dynamic-purple/5 to-dynamic-pink/10',
    primaryButtonClassName:
      'border border-dynamic-purple/30 bg-dynamic-purple/12 text-dynamic-purple hover:bg-dynamic-purple/18',
    progressClassName: 'bg-dynamic-purple/10',
    progressIndicatorClassName: 'bg-dynamic-purple',
    previewClassName:
      'border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/20 to-dynamic-pink/10',
    radioClassName:
      'border-dynamic-purple/35 text-dynamic-purple focus-visible:outline-dynamic-purple/40 focus-visible:ring-dynamic-purple/15 [&_svg]:fill-dynamic-purple',
    secondaryButtonClassName:
      'border border-dynamic-purple/20 bg-background/80 hover:border-dynamic-purple/35 hover:bg-dynamic-purple/8',
    selectedOptionClassName:
      'border-dynamic-purple bg-dynamic-purple/15 text-dynamic-purple shadow-sm shadow-dynamic-purple/15',
    tabListClassName: 'border border-dynamic-purple/15 bg-background/70',
    tabTriggerClassName:
      'rounded-xl data-[state=active]:border data-[state=active]:border-dynamic-purple/30 data-[state=active]:bg-dynamic-purple/12 data-[state=active]:text-dynamic-purple',
  },
  'dynamic-red': {
    cardClassName:
      'border-dynamic-red/20 bg-background/90 shadow-xl shadow-dynamic-red/10',
    checkboxClassName:
      'border-dynamic-red/35 focus-visible:outline-dynamic-red/40 focus-visible:ring-dynamic-red/15 data-[state=checked]:border-dynamic-red data-[state=checked]:bg-dynamic-red data-[state=indeterminate]:border-dynamic-red data-[state=indeterminate]:bg-dynamic-red/80 data-[state=checked]:text-background data-[state=indeterminate]:text-background',
    fieldClassName:
      'border-border/60 bg-background/80 focus-visible:outline-dynamic-red/40 focus-visible:ring-dynamic-red/15',
    heroClassName:
      'border-dynamic-red/25 bg-linear-to-br from-dynamic-red/15 via-background/95 to-dynamic-orange/10',
    iconClassName:
      'border border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red',
    optionCardClassName:
      'border-border/60 bg-background/70 hover:border-dynamic-red/35',
    pageClassName:
      'bg-linear-to-b from-background via-dynamic-red/5 to-dynamic-orange/10',
    primaryButtonClassName:
      'border border-dynamic-red/30 bg-dynamic-red/12 text-dynamic-red hover:bg-dynamic-red/18',
    progressClassName: 'bg-dynamic-red/10',
    progressIndicatorClassName: 'bg-dynamic-red',
    previewClassName:
      'border-dynamic-red/30 bg-linear-to-br from-dynamic-red/20 to-dynamic-orange/10',
    radioClassName:
      'border-dynamic-red/35 text-dynamic-red focus-visible:outline-dynamic-red/40 focus-visible:ring-dynamic-red/15 [&_svg]:fill-dynamic-red',
    secondaryButtonClassName:
      'border border-dynamic-red/20 bg-background/80 hover:border-dynamic-red/35 hover:bg-dynamic-red/8',
    selectedOptionClassName:
      'border-dynamic-red bg-dynamic-red/15 text-dynamic-red shadow-sm shadow-dynamic-red/15',
    tabListClassName: 'border border-dynamic-red/15 bg-background/70',
    tabTriggerClassName:
      'rounded-xl data-[state=active]:border data-[state=active]:border-dynamic-red/30 data-[state=active]:bg-dynamic-red/12 data-[state=active]:text-dynamic-red',
  },
  'dynamic-yellow': {
    cardClassName:
      'border-dynamic-yellow/20 bg-background/90 shadow-xl shadow-dynamic-yellow/10',
    checkboxClassName:
      'border-dynamic-yellow/35 focus-visible:outline-dynamic-yellow/40 focus-visible:ring-dynamic-yellow/15 data-[state=checked]:border-dynamic-yellow data-[state=checked]:bg-dynamic-yellow data-[state=indeterminate]:border-dynamic-yellow data-[state=indeterminate]:bg-dynamic-yellow/80 data-[state=checked]:text-background data-[state=indeterminate]:text-background',
    fieldClassName:
      'border-border/60 bg-background/80 focus-visible:outline-dynamic-yellow/40 focus-visible:ring-dynamic-yellow/15',
    heroClassName:
      'border-dynamic-yellow/25 bg-linear-to-br from-dynamic-yellow/15 via-background/95 to-dynamic-orange/10',
    iconClassName:
      'border border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow',
    optionCardClassName:
      'border-border/60 bg-background/70 hover:border-dynamic-yellow/35',
    pageClassName:
      'bg-linear-to-b from-background via-dynamic-yellow/5 to-dynamic-orange/10',
    primaryButtonClassName:
      'border border-dynamic-yellow/30 bg-dynamic-yellow/12 text-dynamic-yellow hover:bg-dynamic-yellow/18',
    progressClassName: 'bg-dynamic-yellow/10',
    progressIndicatorClassName: 'bg-dynamic-yellow',
    previewClassName:
      'border-dynamic-yellow/30 bg-linear-to-br from-dynamic-yellow/20 to-dynamic-orange/10',
    radioClassName:
      'border-dynamic-yellow/35 text-dynamic-yellow focus-visible:outline-dynamic-yellow/40 focus-visible:ring-dynamic-yellow/15 [&_svg]:fill-dynamic-yellow',
    secondaryButtonClassName:
      'border border-dynamic-yellow/20 bg-background/80 hover:border-dynamic-yellow/35 hover:bg-dynamic-yellow/8',
    selectedOptionClassName:
      'border-dynamic-yellow bg-dynamic-yellow/15 text-dynamic-yellow shadow-sm shadow-dynamic-yellow/15',
    tabListClassName: 'border border-dynamic-yellow/15 bg-background/70',
    tabTriggerClassName:
      'rounded-xl data-[state=active]:border data-[state=active]:border-dynamic-yellow/30 data-[state=active]:bg-dynamic-yellow/12 data-[state=active]:text-dynamic-yellow',
  },
};

const FALLBACK_THEME_PRESET: FormThemePreset = {
  id: 'editorial-moss',
  name: 'Editorial Moss',
  kicker: 'Measured, warm, thoughtful',
  accentColor: 'dynamic-green',
  headlineFontId: 'noto-serif',
  bodyFontId: 'be-vietnam-pro',
  surfaceStyle: 'paper',
};

export const FORM_THEME_PRESETS: FormThemePreset[] = [
  FALLBACK_THEME_PRESET,
  {
    id: 'signal-coral',
    name: 'Signal Coral',
    kicker: 'Louder, faster, sharper',
    accentColor: 'dynamic-orange',
    headlineFontId: 'inter',
    bodyFontId: 'be-vietnam-pro',
    surfaceStyle: 'panel',
  },
  {
    id: 'night-ledger',
    name: 'Night Ledger',
    kicker: 'Dense, cinematic, analytical',
    accentColor: 'dynamic-cyan',
    headlineFontId: 'merriweather',
    bodyFontId: 'noto-sans',
    surfaceStyle: 'glass',
  },
  {
    id: 'coastal-notes',
    name: 'Coastal Notes',
    kicker: 'Open, airy, quietly optimistic',
    accentColor: 'dynamic-blue',
    headlineFontId: 'lora',
    bodyFontId: 'inter',
    surfaceStyle: 'glass',
  },
  {
    id: 'rose-ritual',
    name: 'Rose Ritual',
    kicker: 'Personal, elegant, lightly romantic',
    accentColor: 'dynamic-pink',
    headlineFontId: 'noto-serif',
    bodyFontId: 'be-vietnam-pro',
    surfaceStyle: 'paper',
  },
  {
    id: 'indigo-brief',
    name: 'Indigo Brief',
    kicker: 'Sharp, credible, boardroom-ready',
    accentColor: 'dynamic-indigo',
    headlineFontId: 'inter',
    bodyFontId: 'noto-sans',
    surfaceStyle: 'panel',
  },
  {
    id: 'amber-pulse',
    name: 'Amber Pulse',
    kicker: 'Warm, energetic, feedback-first',
    accentColor: 'dynamic-yellow',
    headlineFontId: 'merriweather',
    bodyFontId: 'be-vietnam-pro',
    surfaceStyle: 'paper',
  },
  {
    id: 'velvet-signal',
    name: 'Velvet Signal',
    kicker: 'Confident, expressive, launch-day ready',
    accentColor: 'dynamic-purple',
    headlineFontId: 'playfair-display',
    bodyFontId: 'plus-jakarta-sans',
    surfaceStyle: 'glass',
  },
  {
    id: 'graph-paper',
    name: 'Graph Paper',
    kicker: 'Quiet grids, serious detail, strong legibility',
    accentColor: 'dynamic-gray',
    headlineFontId: 'spectral',
    bodyFontId: 'inter',
    surfaceStyle: 'panel',
  },
  {
    id: 'terracotta-ledger',
    name: 'Terracotta Ledger',
    kicker: 'Warm confidence with a more human edge',
    accentColor: 'dynamic-red',
    headlineFontId: 'playfair-display',
    bodyFontId: 'be-vietnam-pro',
    surfaceStyle: 'paper',
  },
  {
    id: 'linen-story',
    name: 'Linen Story',
    kicker: 'Soft editorial texture with lighter contrast',
    accentColor: 'dynamic-yellow',
    headlineFontId: 'newsreader',
    bodyFontId: 'source-sans-3',
    surfaceStyle: 'paper',
  },
  {
    id: 'fjord-grid',
    name: 'Fjord Grid',
    kicker: 'Cool structure for denser ops-heavy forms',
    accentColor: 'dynamic-blue',
    headlineFontId: 'space-grotesk',
    bodyFontId: 'source-sans-3',
    surfaceStyle: 'panel',
  },
  {
    id: 'studio-sand',
    name: 'Studio Sand',
    kicker: 'Calmer neutrals with softer review energy',
    accentColor: 'dynamic-gray',
    headlineFontId: 'fraunces',
    bodyFontId: 'manrope',
    surfaceStyle: 'paper',
  },
  {
    id: 'solar-metric',
    name: 'Solar Metric',
    kicker: 'Bright operational clarity with fast scanning',
    accentColor: 'dynamic-orange',
    headlineFontId: 'barlow',
    bodyFontId: 'inter',
    surfaceStyle: 'panel',
  },
  {
    id: 'mint-terminal',
    name: 'Mint Terminal',
    kicker: 'Sharper green tech tone for internal workflows',
    accentColor: 'dynamic-green',
    headlineFontId: 'fira-sans',
    bodyFontId: 'space-grotesk',
    surfaceStyle: 'glass',
  },
  {
    id: 'orchard-brief',
    name: 'Orchard Brief',
    kicker: 'Human, optimistic, and still presentation-ready',
    accentColor: 'dynamic-green',
    headlineFontId: 'dm-serif-display',
    bodyFontId: 'nunito-sans',
    surfaceStyle: 'paper',
  },
];

export const DEFAULT_FORM_THEME = {
  presetId: FALLBACK_THEME_PRESET.id,
  density: 'balanced',
  accentColor: FALLBACK_THEME_PRESET.accentColor,
  headlineFontId: FALLBACK_THEME_PRESET.headlineFontId,
  bodyFontId: FALLBACK_THEME_PRESET.bodyFontId,
  surfaceStyle: FALLBACK_THEME_PRESET.surfaceStyle,
  coverHeadline: '',
  coverKicker: FALLBACK_THEME_PRESET.kicker,
} as const;

export function getThemePreset(presetId: string) {
  return (
    FORM_THEME_PRESETS.find((preset) => preset.id === presetId) ??
    FALLBACK_THEME_PRESET
  );
}

export function getFormToneClasses(
  accentColor: FormAccentTone
): FormToneClasses {
  return (
    TONE_CLASS_MAP[accentColor] ??
    TONE_CLASS_MAP[FALLBACK_THEME_PRESET.accentColor]
  );
}
