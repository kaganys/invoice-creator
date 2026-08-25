import { describe, expect, it } from 'vitest'
import {
  type BuildAssetBundle,
  isForbiddenLocalSecretFile,
  stripForbiddenBuildAssets,
} from './secretOutput.ts'

describe('secret build output guards', () => {
  it('flags local secret files but keeps safe example files', () => {
    expect(isForbiddenLocalSecretFile('.dev.vars')).toBe(true)
    expect(isForbiddenLocalSecretFile('.dev.vars.preview')).toBe(true)
    expect(isForbiddenLocalSecretFile('.env')).toBe(true)
    expect(isForbiddenLocalSecretFile('.env.local')).toBe(true)
    expect(isForbiddenLocalSecretFile('.env.preview.local')).toBe(true)

    expect(isForbiddenLocalSecretFile('.dev.vars.example')).toBe(false)
    expect(isForbiddenLocalSecretFile('.env.example')).toBe(false)
    expect(isForbiddenLocalSecretFile('assets/index.js')).toBe(false)
  })

  it('removes forbidden secret assets from a generated bundle', () => {
    const bundle = {
      '.dev.vars': {
        fileName: '.dev.vars',
        name: '.dev.vars',
        needsCodeReference: false,
        source: 'SMTP_PASSWORD=secret',
        type: 'asset',
      },
      '.env.local': {
        fileName: '.env.local',
        name: '.env.local',
        needsCodeReference: false,
        source: 'STRIPE_SECRET_KEY=secret',
        type: 'asset',
      },
      '.dev.vars.example': {
        fileName: '.dev.vars.example',
        name: '.dev.vars.example',
        needsCodeReference: false,
        source: 'SMTP_PASSWORD=',
        type: 'asset',
      },
      'index.js': {
        code: 'export default {}',
        dynamicImports: [],
        exports: [],
        facadeModuleId: null,
        fileName: 'index.js',
        implicitlyLoadedBefore: [],
        importedBindings: {},
        imports: [],
        isDynamicEntry: false,
        isEntry: true,
        isImplicitEntry: false,
        map: null,
        moduleIds: [],
        modules: {},
        name: 'index',
        preliminaryFileName: 'index.js',
        referencedFiles: [],
        sourcemapFileName: null,
        type: 'chunk',
      },
    } satisfies BuildAssetBundle

    const removed = stripForbiddenBuildAssets(bundle)

    expect(removed).toEqual(['.dev.vars', '.env.local'])
    expect(bundle['.dev.vars']).toBeUndefined()
    expect(bundle['.env.local']).toBeUndefined()
    expect(bundle['.dev.vars.example']).toBeDefined()
    expect(bundle['index.js']).toBeDefined()
  })
})
