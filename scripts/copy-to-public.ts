import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { glob } from 'glob'

interface CopyStats {
  totalFiles: number
  copiedFiles: number
  errors: Array<{
    file: string
    error: string
  }>
}

const ALLOWED_EXTENSIONS = [
  '.sol',
  '.abi.json',
  '.blox.json',
  '.md',
  '.mdx',
  '.txt',
  '.pdf'
] as const

type AllowedExtension = typeof ALLOWED_EXTENSIONS[number]

function isAllowedExtension(filename: string): boolean {
  return ALLOWED_EXTENSIONS.some(ext => filename.endsWith(ext))
}

/**
 * Copy specific files from root to public directory, supporting glob patterns
 */
function copyRootFiles(
  patterns: string[],
  targetDir: string,
  stats: CopyStats
): void {
  patterns.forEach(pattern => {
    try {
      // Handle glob patterns
      if (pattern.includes('*')) {
        const matches = glob.sync(pattern, {
          cwd: path.resolve(__dirname, '..'),
          nodir: true
        })
        
        matches.forEach(file => {
          const sourcePath = path.resolve(__dirname, '..', file)
          const targetPath = path.join(targetDir, file)
          
          // Create target directory if it doesn't exist
          const targetDirPath = path.dirname(targetPath)
          if (!fs.existsSync(targetDirPath)) {
            fs.mkdirSync(targetDirPath, { recursive: true })
          }
          
          try {
            stats.totalFiles++
            fs.copyFileSync(sourcePath, targetPath)
            stats.copiedFiles++
            console.log(`✓ Copied: ${path.relative(process.cwd(), sourcePath)} → ${path.relative(process.cwd(), targetPath)}`)
          } catch (error) {
            stats.errors.push({
              file: sourcePath,
              error: error instanceof Error ? error.message : 'Unknown error'
            })
            console.error(`✗ Error copying ${sourcePath}:`, error)
          }
        })
      } else {
        // Handle direct file paths
        const sourcePath = path.resolve(__dirname, '..', pattern)
        const targetPath = path.join(targetDir, pattern)
        
        if (fs.existsSync(sourcePath)) {
          // Create target directory if it doesn't exist
          const targetDirPath = path.dirname(targetPath)
          if (!fs.existsSync(targetDirPath)) {
            fs.mkdirSync(targetDirPath, { recursive: true })
          }
          
          stats.totalFiles++
          fs.copyFileSync(sourcePath, targetPath)
          stats.copiedFiles++
          console.log(`✓ Copied: ${path.relative(process.cwd(), sourcePath)} → ${path.relative(process.cwd(), targetPath)}`)
        } else {
          stats.errors.push({
            file: sourcePath,
            error: 'File not found'
          })
          console.error(`✗ File not found: ${sourcePath}`)
        }
      }
    } catch (error) {
      stats.errors.push({
        file: pattern,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      console.error(`✗ Error processing ${pattern}:`, error)
    }
  })
}

/**
 * Recursively copy contract files from src/blox to public/blox
 * while maintaining the directory structure
 */
function copyContractsRecursively(
  sourceDir: string,
  targetDir: string,
  stats: CopyStats = { totalFiles: 0, copiedFiles: 0, errors: [] }
): CopyStats {
  // Create target directory if it doesn't exist
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }

  try {
    // Read all items in the source directory
    const items = fs.readdirSync(sourceDir)

    items.forEach(item => {
      const sourcePath = path.join(sourceDir, item)
      const targetPath = path.join(targetDir, item)

      try {
        const isDirectory = fs.statSync(sourcePath).isDirectory()

        if (isDirectory) {
          // Recursively copy subdirectories
          copyContractsRecursively(sourcePath, targetPath, stats)
        } else if (isAllowedExtension(item)) {
          stats.totalFiles++
          // Copy relevant contract files
          fs.copyFileSync(sourcePath, targetPath)
          stats.copiedFiles++
          console.log(`✓ Copied: ${path.relative(process.cwd(), sourcePath)} → ${path.relative(process.cwd(), targetPath)}`)
        }
      } catch (error) {
        stats.errors.push({
          file: sourcePath,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        console.error(`✗ Error processing ${sourcePath}:`, error)
      }
    })
  } catch (error) {
    stats.errors.push({
      file: sourceDir,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    console.error(`✗ Error reading directory ${sourceDir}:`, error)
  }

  return stats
}

// Get the current file's directory in ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Get the absolute paths for source and target directories
const bloxDir = path.resolve(__dirname, '../src/blox')
const publicBloxDir = path.resolve(__dirname, '../public/blox')
const publicDir = path.resolve(__dirname, '../public')

// Start the copying process
try {
  console.log('\nCopying contract files...\n')
  
  const stats = copyContractsRecursively(bloxDir, publicBloxDir)
  
  // Copy documentation and legal files
  console.log('\nCopying documentation and legal files...\n')
  copyRootFiles([
    'TERMS.md', 
    'PRIVACY.md',
    //'README.md',
    //'CONTRIBUTING.md',
    //'CHANGELOG.md',
    //'LICENSE',
    'docs/**/*'
  ], publicDir, stats)
  
  console.log('\nCopy process completed:')
  console.log(`Total files processed: ${stats.totalFiles}`)
  console.log(`Successfully copied: ${stats.copiedFiles}`)
  console.log(`Errors encountered: ${stats.errors.length}`)
  
  if (stats.errors.length > 0) {
    console.log('\nErrors:')
    stats.errors.forEach(({ file, error }) => {
      console.error(`  ✗ ${path.relative(process.cwd(), file)}: ${error}`)
    })
    process.exit(1)
  }
} catch (error) {
  console.error('\n✗ Fatal error:', error)
  process.exit(1)
} 