import fs from 'node:fs'
import path from 'node:path'

const OUTPUT_DIR = path.resolve(process.cwd(), 'dist')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'github-projects.json')

const GITHUB_QUERY = 'stars:>0 sort:updated-desc'
const GITHUB_API = 'https://api.github.com/search/repositories'

const headers = {
  'User-Agent': 'banminton-crawler/1.0',
  Accept: 'application/vnd.github+json',
}

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

async function fetchGitHubProjects() {
  const url = new URL(GITHUB_API)
  url.search = new URLSearchParams({
    q: GITHUB_QUERY,
    sort: 'updated',
    order: 'desc',
    per_page: '10',
  }).toString()

  const response = await fetch(url, { headers })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GitHub API request failed (${response.status}): ${body}`)
  }

  const json = await response.json()

  return (json.items || []).map((item) => ({
    id: item.id,
    full_name: item.full_name,
    html_url: item.html_url,
    description: item.description,
    language: item.language,
    stargazers_count: item.stargazers_count,
    forks_count: item.forks_count,
    updated_at: item.updated_at,
    topics: item.topics || [],
  }))
}

async function main() {
  try {
    ensureOutputDir()
    const projects = await fetchGitHubProjects()

    const payload = {
      crawled_at: new Date().toISOString(),
      query: GITHUB_QUERY,
      total_count: projects.length,
      projects,
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2) + '\n', 'utf8')
    console.log(`Saved ${projects.length} GitHub projects to ${OUTPUT_FILE}`)
  } catch (error) {
    console.error('Failed to crawl GitHub projects:', error.message)
    process.exitCode = 1
  }
}

main()
