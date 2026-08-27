import {
  BRAND,
  BUILTIN_BRANDING_PATHS,
  brandingFileUrl,
  companyIdFromObjectKey,
  isAllowedBrandingPath,
  isSafeObjectKey,
  objectKeyFromFileUrl,
  type BrandingKind,
} from '../../src/branding.ts'
import { asTrimmedString, isRecord } from '../lib/json.ts'
import { DEFAULT_COMPANY_ID } from '../tenancy/types.ts'
import type { BrandingConfig, ObjectStore } from './types.ts'
import type { ValidationResult } from '../invoices/validation.ts'

export const BRANDING_KINDS: BrandingKind[] = [
  'site-wordmark',
  'site-icon',
  'invoice-logo',
]

export const MAX_BRANDING_BYTES = 2 * 1024 * 1024

export const BUILTIN_BRANDING: BrandingConfig = {
  siteWordmark: { path: BUILTIN_BRANDING_PATHS['site-wordmark'] },
  siteIcon: { path: BUILTIN_BRANDING_PATHS['site-icon'] },
  invoiceLogo: { path: BUILTIN_BRANDING_PATHS['invoice-logo'] },
}

const KIND_KEY: Record<BrandingKind, keyof BrandingConfig> = {
  'site-wordmark': 'siteWordmark',
  'site-icon': 'siteIcon',
  'invoice-logo': 'invoiceLogo',
}

export function isBrandingKind(value: string): value is BrandingKind {
  return BRANDING_KINDS.includes(value as BrandingKind)
}

export function brandingPathAllowedForCompany(
  path: string,
  companyId: string,
): boolean {
  if (path === BRAND.wordmark || path === BRAND.icon) {
    return true
  }
  const key = objectKeyFromFileUrl(path) ?? (isSafeObjectKey(path) ? path : null)
  if (!key) {
    return false
  }
  const owner = companyIdFromObjectKey(key)
  if (owner) {
    return owner.toLowerCase() === companyId.toLowerCase()
  }
  return companyId === DEFAULT_COMPANY_ID
}

function sanitizePath(
  value: unknown,
  fallback: string,
  companyId?: string,
): { path: string } {
  function accept(path: string): { path: string } | null {
    if (!isAllowedBrandingPath(path)) {
      return null
    }
    if (companyId && !brandingPathAllowedForCompany(path, companyId)) {
      return null
    }
    return { path }
  }

  if (typeof value === 'string') {
    return accept(value.trim()) ?? { path: fallback }
  }
  if (!isRecord(value)) {
    return { path: fallback }
  }
  const nested = asTrimmedString(value.path)
  const nestedAccepted = accept(nested)
  if (nestedAccepted) {
    return nestedAccepted
  }
  const objectKey = asTrimmedString(value.objectKey)
  if (isSafeObjectKey(objectKey)) {
    const url = brandingFileUrl(objectKey)
    return accept(url) ?? { path: fallback }
  }
  return { path: fallback }
}

export function parseBrandingJson(
  raw: string | null,
  companyId?: string,
): BrandingConfig {
  if (!raw) {
    return {
      siteWordmark: { ...BUILTIN_BRANDING.siteWordmark },
      siteIcon: { ...BUILTIN_BRANDING.siteIcon },
      invoiceLogo: { ...BUILTIN_BRANDING.invoiceLogo },
    }
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) {
      return parseBrandingJson(null, companyId)
    }
    return {
      siteWordmark: sanitizePath(
        parsed.siteWordmark,
        BUILTIN_BRANDING.siteWordmark.path,
        companyId,
      ),
      siteIcon: sanitizePath(
        parsed.siteIcon,
        BUILTIN_BRANDING.siteIcon.path,
        companyId,
      ),
      invoiceLogo: sanitizePath(
        parsed.invoiceLogo,
        BUILTIN_BRANDING.invoiceLogo.path,
        companyId,
      ),
    }
  } catch {
    return parseBrandingJson(null, companyId)
  }
}

export function serializeBranding(config: BrandingConfig): string {
  return JSON.stringify(config)
}

export function assetForKind(
  config: BrandingConfig,
  kind: BrandingKind,
): { path: string } {
  return config[KIND_KEY[kind]]
}

export function withAsset(
  config: BrandingConfig,
  kind: BrandingKind,
  path: string,
): BrandingConfig {
  return {
    ...config,
    [KIND_KEY[kind]]: { path },
  }
}

export function publicAsset(kind: BrandingKind, asset: { path: string }) {
  const path = isAllowedBrandingPath(asset.path)
    ? asset.path
    : BUILTIN_BRANDING_PATHS[kind]
  return {
    kind,
    path,
    url: path,
    isDefault: path === BUILTIN_BRANDING_PATHS[kind],
  }
}

export function publicBranding(config: BrandingConfig) {
  return {
    siteWordmark: publicAsset('site-wordmark', config.siteWordmark),
    siteIcon: publicAsset('site-icon', config.siteIcon),
    invoiceLogo: publicAsset('invoice-logo', config.invoiceLogo),
  }
}

export function builtinPath(kind: BrandingKind): string {
  return BUILTIN_BRANDING_PATHS[kind]
}

export function safeObjectKey(
  kind: BrandingKind,
  id: string,
  ext: string,
  companyId?: string,
): string {
  if (companyId) {
    return `branding/${companyId}/${kind}/${id}.${ext}`
  }
  return `branding/${kind}/${id}.${ext}`
}

export async function putBrandingObject(
  objects: ObjectStore,
  companyId: string,
  kind: BrandingKind,
  bytes: Uint8Array,
  declaredType: string,
  id: string,
): Promise<ValidationResult<{ path: string }>> {
  const validated = validateUploadBytes(bytes, declaredType)
  if (!validated.ok) {
    return validated
  }
  const objectKey = safeObjectKey(kind, id, validated.value.ext, companyId)
  await objects.put(objectKey, bytes, validated.value.contentType)
  return { ok: true, value: { path: brandingFileUrl(objectKey) } }
}

export { BRAND, brandingFileUrl, isSafeObjectKey, objectKeyFromFileUrl }

export type SniffedImage = {
  ext: 'png' | 'jpg' | 'webp'
  contentType: 'image/png' | 'image/jpeg' | 'image/webp'
}

export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  if (bytes.length < 12) {
    return null
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { ext: 'png', contentType: 'image/png' }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: 'jpg', contentType: 'image/jpeg' }
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { ext: 'webp', contentType: 'image/webp' }
  }
  return null
}

export function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder('utf-8')
    .decode(bytes.slice(0, 256))
    .trim()
    .toLowerCase()
  return head.startsWith('<svg') || head.includes('<svg') || head.startsWith('<?xml')
}

export function validateUploadBytes(
  bytes: Uint8Array,
  declaredType: string,
): ValidationResult<SniffedImage> {
  if (bytes.byteLength === 0) {
    return { ok: false, message: 'The uploaded file is empty.' }
  }
  if (bytes.byteLength > MAX_BRANDING_BYTES) {
    return { ok: false, message: 'Branding images must be 2 MB or smaller.' }
  }
  if (looksLikeSvg(bytes) || declaredType.toLowerCase().includes('svg')) {
    return {
      ok: false,
      message: 'SVG uploads are not allowed. Use PNG, JPEG, or WebP.',
    }
  }
  const sniffed = sniffImage(bytes)
  if (!sniffed) {
    return {
      ok: false,
      message: 'File is not a supported image. Use PNG, JPEG, or WebP.',
    }
  }
  const declared = declaredType.toLowerCase().split(';')[0]?.trim() ?? ''
  if (
    declared &&
    declared !== 'application/octet-stream' &&
    declared !== sniffed.contentType &&
    !(declared === 'image/jpg' && sniffed.contentType === 'image/jpeg')
  ) {
    return {
      ok: false,
      message: 'File contents do not match the declared image type.',
    }
  }
  return { ok: true, value: sniffed }
}
