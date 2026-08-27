import { readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import type { Plugin } from 'vite'

export type BuildAssetBundle = Record<string, unknown>

const SAFE_EXAMPLE_BASENAMES = new Set([
  '.dev.vars.example',
  '.env.example',
])

export function isForbiddenLocalSecretFile(filePath: string): boolean {
  const base = path.posix.basename(filePath.replace(/\\/g, '/'))
  if (SAFE_EXAMPLE_BASENAMES.has(base)) {
    return false
  }

  if (base === '.dev.vars' || base.startsWith('.dev.vars.')) {
    return true
  }
  if (base === '.env' || base.startsWith('.env.')) {
    return true
  }

  return false
}

export function stripForbiddenBuildAssets(bundle: BuildAssetBundle): string[] {
  const removed = Object.keys(bundle).filter((fileName) =>
    isForbiddenLocalSecretFile(fileName),
  )

  for (const fileName of removed) {
    delete bundle[fileName]
  }

  return removed
}

export async function removeForbiddenFilesFromDirectory(
  rootDirectory: string,
): Promise<string[]> {
  const removed: string[] = []

  async function walk(currentDirectory: string): Promise<void> {
    const entries = await readdir(currentDirectory, { withFileTypes: true })
    for (const entry of entries) {
      const absolutePath = path.join(currentDirectory, entry.name)
      if (entry.isDirectory()) {
        await walk(absolutePath)
        continue
      }

      const relativePath = path.relative(rootDirectory, absolutePath)
      if (!isForbiddenLocalSecretFile(relativePath)) {
        continue
      }

      await rm(absolutePath, { force: true })
      removed.push(relativePath)
    }
  }

  await walk(rootDirectory)
  return removed
}

export function stripLocalSecretBuildOutput(): Plugin {
  return {
    name: 'strip-local-secret-build-output',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const removed = stripForbiddenBuildAssets(bundle)
      if (removed.length > 0) {
        this.warn(
          `Removed local secret build assets: ${removed.join(', ')}`,
        )
      }
    },
    async writeBundle(options) {
      const outputDirectory =
        typeof options.dir === 'string'
          ? options.dir
          : options.file
            ? path.dirname(options.file)
            : null

      if (!outputDirectory) {
        return
      }

      const removed = await removeForbiddenFilesFromDirectory(outputDirectory)
      if (removed.length > 0) {
        this.warn(
          `Deleted local secret files from build output: ${removed.join(', ')}`,
        )
      }
    },
  }
}
