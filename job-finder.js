// Multi-source remote job crawler.
// Fetch jobs: npm run find
// View dashboard: npm start -> http://localhost:3000

const fs = require('fs');
const path = require('path');
const { isWithinLast24Hours } = require('./utils/date-utils');

const DATA_FILE = path.join(__dirname, 'jobs.json');

const INCLUDE_KEYWORDS = [
  'full stack', 'fullstack', 'mern', 'react', 'node', 'node.js', 'laravel',
  'nestjs', 'next.js', 'php', 'javascript', 'typescript', 'frontend',
  'front end', 'backend', 'back end', 'python', 'fastapi', 'django',
  'wordpress', 'headless cms', 'sanity', 'ai engineer', 'llm engineer',
  'rag', 'openai'
];

const EXCLUDE_KEYWORDS = [
  'principal', 'staff engineer', 'director', 'manager', 'head of', 'vp ',
  'onsite', 'on-site', 'hybrid', 'office', 'relocation'
];

const REMOTE_KEYWORDS = [
  'remote', 'worldwide', 'anywhere', 'work from home', 'wfh', 'distributed',
  'global', 'fully remote'
];

const GLOBAL_REMOTE_KEYWORDS = [
  'worldwide', 'anywhere', 'global', 'international', 'distributed',
  'work from anywhere'
];

const REGION_REMOTE_PATTERNS = [
  /\b(us|usa|united states|canada|uk|united kingdom|europe|emea|latam|apac|australia|germany|france|spain|portugal)\b/i
];

const ATS_COMPANIES = {
  greenhouse: [
    'gitlab', 'discord', 'figma', 'robinhood', 'samsara', 'trustpilot',
    'nearform', 'elastic', 'postman', 'coursera', 'circleci', 'clever',
    'khanacademy'
  ],
  lever: [
    'netflix', 'toptal', 'coderpad', 'logrocket'
  ],
  ashby: [
    'ramp', 'mercury', 'deel', 'notion', 'linear', 'vanta', 'replit',
    'zapier', 'harvey', 'gorgias', 'lemonade', 'runway'
  ],
  smartrecruiters: [
    'Visa', 'Bosch', 'Equinix', 'Ubisoft', 'Skechers', 'AveryDennison'
  ],
  recruitee: [],
  personio: [
    'aboutyou'
  ],
  teamtailor: [],
  breezyhr: [],
  workable: [
    'babbel', 'feedly', 'deliveroo'
  ]
};

const SEARCH_TARGETS_FILE = path.join(__dirname, 'search-targets.json');

function googleSearchUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function target(category, name, query, reason = 'Search result pages are monitored manually; use these to discover new direct job URLs or ATS slugs.') {
  return {
    category,
    name,
    query,
    url: googleSearchUrl(query),
    reason
  };
}

const SEARCH_TARGETS = [
  target('Google Core', 'Node.js / NestJS remote', '(intitle:"senior full stack" OR intitle:"node.js engineer" OR intitle:"nestjs developer") "remote" ("node.js" OR "nestjs") after:2026-05-01'),
  target('Google Core', 'Python / FastAPI / Django remote', '(intitle:"python engineer" OR intitle:"fastapi" OR intitle:"django developer") "fully remote" after:2026-05-01'),
  target('Google Core', 'React / Next.js remote', '(intitle:"senior react engineer" OR intitle:"next.js developer" OR intitle:"frontend engineer") "remote" ("typescript" OR "tailwind") after:2026-05-01'),
  target('Google Core', 'Laravel / PHP remote', '(intitle:"laravel developer" OR intitle:"php engineer" OR intitle:"symfony") "remote" ("vue.js" OR "inertia" OR "livewire") after:2026-05-01'),
  target('Google Core', 'CMS / Headless WordPress remote', '(intitle:"wordpress developer" OR intitle:"headless cms" OR intitle:"sanity developer") "remote" ("next.js" OR "graphql") after:2026-05-01'),
  target('Google Core', 'AI / LLM / RAG remote', '(intitle:"ai engineer" OR intitle:"llm engineer") "remote" ("rag" OR "openai" OR "vector database") after:2026-05-01'),
  target('LinkedIn', 'LinkedIn Jobs Node / NestJS', 'site:linkedin.com/jobs "senior full stack" "remote" ("node.js" OR "nestjs") after:2026-05-01', 'LinkedIn blocks reliable unauthenticated scraping; monitor manually or use an approved API/provider.'),
  target('LinkedIn', 'LinkedIn Jobs React / Next.js', 'site:linkedin.com/jobs ("senior frontend" OR "senior full stack") "remote" ("next.js" OR "react") "typescript" after:2026-05-01', 'LinkedIn blocks reliable unauthenticated scraping; monitor manually or use an approved API/provider.'),
  target('LinkedIn', 'LinkedIn Jobs Laravel / PHP', 'site:linkedin.com/jobs ("laravel engineer" OR "php developer") "remote" after:2026-05-01', 'LinkedIn blocks reliable unauthenticated scraping; monitor manually or use an approved API/provider.'),
  target('LinkedIn', 'LinkedIn Posts founders hiring directly', 'site:linkedin.com/posts ("hiring" OR "we\'re hiring") ("full stack" OR "senior full stack" OR "react" OR "node.js") ("remote" OR "worldwide" OR "anywhere") after:2026-05-11', 'LinkedIn posts are best reviewed manually or through approved APIs.'),
  target('LinkedIn', 'LinkedIn Posts AI / full stack', 'site:linkedin.com/posts ("hiring" OR "looking for") ("AI engineer" OR "full stack engineer") ("React" OR "Next.js") ("Node.js" OR "Python") remote', 'LinkedIn posts are best reviewed manually or through approved APIs.'),
  target('LinkedIn', 'LinkedIn CTO / manager posts', 'site:linkedin.com/posts ("looking for" OR "dm me") ("senior engineer" OR "full stack developer") "remote" after:2026-05-01', 'LinkedIn posts are best reviewed manually or through approved APIs.'),
  target('LinkedIn', 'LinkedIn Pulse job mentions', 'site:linkedin.com/pulse ("we are hiring" OR "open role") "full stack" "remote" after:2026-05-01', 'LinkedIn Pulse is best reviewed manually or through approved APIs.'),
  target('Wellfound', 'Wellfound full stack / Node', 'site:wellfound.com/jobs ("full stack" OR "node.js" OR "nestjs") "remote" after:2026-05-04'),
  target('Wellfound', 'Wellfound React / Next.js', 'site:wellfound.com/jobs ("react" OR "next.js") "senior" "remote" after:2026-05-04'),
  target('Wellfound', 'Wellfound Python / AI stack', 'site:wellfound.com/jobs ("python" OR "fastapi") ("ai" OR "llm" OR "rag") "remote" after:2026-05-01'),
  target('Wellfound', 'Wellfound Laravel / PHP', 'site:wellfound.com/jobs ("laravel" OR "php") "remote" after:2026-05-01'),
  target('Job Boards', 'Remotive', 'site:remotive.com ("full stack" OR "node.js" OR "react" OR "laravel") "senior" after:2026-05-01'),
  target('Job Boards', 'We Work Remotely', 'site:weworkremotely.com ("full stack" OR "node.js" OR "next.js" OR "python") after:2026-05-01'),
  target('Job Boards', 'Remote.co', 'site:remote.co/remote-jobs ("full stack engineer" OR "node developer" OR "react developer") after:2026-05-01'),
  target('Job Boards', 'Himalayas', 'site:himalayas.app ("full stack" OR "node.js" OR "nestjs" OR "laravel") "senior" after:2026-05-01'),
  target('Job Boards', 'Indeed remote only', 'site:indeed.com ("senior full stack" OR "senior node.js" OR "senior react") "remote" after:2026-05-01', 'Indeed blocks/special-cases scraping; monitor manually or use an approved API/provider.'),
  target('Job Boards', 'Glassdoor', 'site:glassdoor.com/job-listing ("full stack engineer" OR "node.js developer") "remote" after:2026-05-01'),
  target('ATS', 'Greenhouse ATS', 'site:greenhouse.io ("full stack" OR "node.js" OR "react") "remote" after:2026-05-01'),
  target('ATS', 'Lever ATS', 'site:jobs.lever.co ("full stack" OR "nestjs" OR "next.js") "remote" after:2026-05-11'),
  target('ATS', 'Workable ATS', 'site:apply.workable.com ("full stack engineer" OR "node.js" OR "react developer") "remote" after:2026-05-08'),
  target('ATS', 'Ashby ATS', 'site:jobs.ashbyhq.com ("full stack engineer" OR "node.js" OR "react developer") "remote" after:2026-05-11'),
  target('Job Boards', 'Toptal', 'site:toptal.com ("full stack" OR "node.js" OR "react") "remote" after:2026-05-01'),
  target('Company Sites', 'Generic careers pages', 'inurl:careers ("senior full stack" OR "node.js engineer") "remote" after:2026-05-01'),
  target('Company Sites', 'Generic jobs pages', 'inurl:jobs ("senior full stack" OR "nestjs" OR "next.js") "remote" -site:linkedin.com -site:indeed.com after:2026-05-01'),
  target('Company Sites', 'AI SaaS startup careers', 'inurl:/careers ("full stack" OR "backend engineer") ("openai" OR "llm" OR "ai") "remote" after:2026-05-01'),
  target('Reddit / Forums', 'r/remotejs hiring posts', 'site:reddit.com/r/remotejs ("hiring" OR "looking for") ("full stack" OR "node" OR "react") after:2026-05-01'),
  target('Reddit / Forums', 'r/forhire remote engineer listings', 'site:reddit.com/r/forhire "[for hire]" ("full stack" OR "node.js" OR "react" OR "laravel") "remote" after:2026-05-01'),
  target('Reddit / Forums', 'r/jobbit', 'site:reddit.com/r/jobbit ("full stack" OR "node" OR "next.js") "remote" after:2026-05-01'),
  target('Reddit / Forums', 'Twitter/X hiring posts', 'site:twitter.com OR site:x.com ("hiring" OR "we\'re hiring") ("full stack engineer" OR "node.js" OR "next.js") "remote" after:2026-05-01'),
  target('Reddit / Forums', 'Hacker News monthly thread', 'site:news.ycombinator.com "who is hiring" ("full stack" OR "node.js" OR "react") "remote" after:2026-05-01')
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function stripHtml(value = '') {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeXml(value = '') {
  return stripHtml(String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'"));
}

function getTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

function parseRssItems(xml) {
  return String(xml).match(/<item[\s\S]*?<\/item>/gi) || [];
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'job-tracker/1.0 (+local personal job search)',
      'Accept': 'application/json,text/plain,*/*',
      ...options.headers
    },
    ...options
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function fetchText(url, options = {}) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'job-tracker/1.0 (+local personal job search)',
      'Accept': 'application/rss+xml,application/xml,text/html,text/plain,*/*',
      ...options.headers
    },
    ...options
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

function detectRemoteScope(job) {
  const text = [
    job.location, job.title, job.description, asArray(job.tags).join(' ')
  ].filter(Boolean).join(' ').toLowerCase();

  if (GLOBAL_REMOTE_KEYWORDS.some(k => text.includes(k))) return 'worldwide';
  if (REGION_REMOTE_PATTERNS.some(pattern => pattern.test(text))) return 'region';
  if (REMOTE_KEYWORDS.some(k => text.includes(k))) return 'unknown';
  return 'not-remote';
}

function matchesFilters(job) {
  const title = String(job.title || '').toLowerCase();
  const text = [
    job.title, job.location, job.description, asArray(job.tags).join(' ')
  ].filter(Boolean).join(' ').toLowerCase();

  const included = INCLUDE_KEYWORDS.some(k => title.includes(k) || text.includes(k));
  const excluded = EXCLUDE_KEYWORDS.some(k => text.includes(k));
  const remoteScope = detectRemoteScope(job);

  return included && !excluded && remoteScope !== 'not-remote';
}

function normalizeJob(job) {
  const today = new Date().toISOString().split('T')[0];
  const title = stripHtml(job.title || '');
  const company = stripHtml(job.company || 'Unknown');
  const location = stripHtml(job.location || 'Remote');
  const link = job.link || job.url || job.apply_url || '';

  return {
    company,
    title,
    link,
    location,
    date_found: today,
    applied: false,
    source: job.source || 'unknown',
    remote_scope: detectRemoteScope(job),
    posted_at: job.posted_at || job.postedAt || job.date || null,
    salary: job.salary || null,
    tags: asArray(job.tags).filter(Boolean),
    description: stripHtml(job.description || '')
  };
}

function loadExisting() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')).map(job => ({
    ...job,
    source: job.source || 'legacy',
    remote_scope: job.remote_scope || detectRemoteScope(job)
  }));
}

function saveAll(jobs) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(jobs, null, 2));
}

function saveSearchTargets() {
  fs.writeFileSync(SEARCH_TARGETS_FILE, JSON.stringify(SEARCH_TARGETS, null, 2));
}

async function safeFetch(source, fetcher) {
  try {
    const jobs = await fetcher();
    console.log(`${source}: fetched ${jobs.length}`);
    return jobs.map(job => ({ ...job, source: job.source || source }));
  } catch (e) {
    console.error(`${source} failed:`, e.message);
    return [];
  }
}

async function fetchRemoteOK() {
  const data = await fetchJson('https://remoteok.com/api');
  return data
    .filter(j => j && j.position)
    .map(j => ({
      source: 'remoteok',
      company: j.company,
      title: j.position,
      link: j.url || j.apply_url,
      location: j.location || 'Remote',
      posted_at: j.date,
      salary: j.salary_min || j.salary_max ? `${j.salary_min || 0}-${j.salary_max || 0}` : null,
      tags: asArray(j.tags),
      description: j.description
    }));
}

async function fetchRemotive() {
  const data = await fetchJson('https://remotive.com/api/remote-jobs?limit=100');
  return asArray(data.jobs).map(j => ({
    source: 'remotive',
    company: j.company_name,
    title: j.title,
    link: j.url,
    location: j.candidate_required_location || 'Remote',
    posted_at: j.publication_date,
    salary: j.salary,
    tags: asArray(j.tags),
    description: j.description
  }));
}

async function fetchWeWorkRemotely() {
  const categories = [
    'remote-programming-jobs',
    'remote-full-stack-programming-jobs',
    'remote-front-end-programming-jobs',
    'remote-back-end-programming-jobs'
  ];
  const jobs = [];

  for (const category of categories) {
    const xml = await fetchText(`https://weworkremotely.com/categories/${category}.rss`);
    for (const item of parseRssItems(xml)) {
      jobs.push({
        source: 'weworkremotely',
        company: getTag(item, 'source') || 'We Work Remotely',
        title: getTag(item, 'title'),
        link: getTag(item, 'link'),
        location: 'Remote',
        posted_at: getTag(item, 'pubDate'),
        tags: [category.replace(/^remote-|-jobs$/g, '').replace(/-/g, ' ')],
        description: getTag(item, 'description')
      });
    }
  }

  return jobs;
}

async function fetchWorkingNomads() {
  const data = await fetchJson('https://www.workingnomads.com/api/exposed_jobs/');
  return asArray(data).map(j => ({
    source: 'workingnomads',
    company: j.company || j.company_name || 'Working Nomads',
    title: j.title,
    link: j.url || j.apply_url,
    location: j.location || 'Remote',
    posted_at: j.pub_date || j.created_at,
    tags: asArray(j.tags),
    description: j.description || ''
  }));
}

async function fetchJobspresso() {
  const xml = await fetchText('https://jobspresso.co/remote-work/rss/');
  return parseRssItems(xml).map(item => ({
    source: 'jobspresso',
    company: 'Jobspresso',
    title: getTag(item, 'title'),
    link: getTag(item, 'link'),
    location: 'Remote',
    posted_at: getTag(item, 'pubDate'),
    description: getTag(item, 'description')
  }));
}

async function fetchHackerNewsWhoIsHiring() {
  const data = await fetchJson('https://hn.algolia.com/api/v1/search_by_date?tags=story&query=Who%20is%20hiring');
  const latest = asArray(data.hits)
    .filter(hit => /who is hiring/i.test(hit.title || ''))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

  if (!latest) return [];

  const comments = await fetchJson(`https://hn.algolia.com/api/v1/items/${latest.objectID}`);
  return asArray(comments.children).map(comment => ({
    source: 'hackernews',
    company: 'Hacker News',
    title: stripHtml(comment.text || '').slice(0, 120),
    link: `https://news.ycombinator.com/item?id=${comment.id}`,
    location: stripHtml(comment.text || ''),
    posted_at: comment.created_at,
    description: comment.text || ''
  }));
}

async function fetchYCombinatorJobs() {
  const html = await fetchText('https://www.ycombinator.com/jobs?remote=true');
  const jobs = [];
  const seen = new Set();
  const jobLinkPattern = /href="(\/companies\/[^"]+\/jobs\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = jobLinkPattern.exec(html)) !== null) {
    const link = `https://www.ycombinator.com${match[1]}`;
    if (seen.has(link)) continue;
    seen.add(link);
    jobs.push({
      source: 'yc-jobs',
      company: 'Y Combinator',
      title: stripHtml(match[2]),
      link,
      location: 'Remote',
      description: ''
    });
  }

  return jobs;
}

async function fetchGreenhouse(slug) {
  const data = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
  return asArray(data.jobs).map(j => ({
    source: 'greenhouse',
    company: slug,
    title: j.title,
    link: j.absolute_url,
    location: j.location?.name || '',
    posted_at: j.updated_at,
    description: j.content || ''
  }));
}

async function fetchLever(slug) {
  const data = await fetchJson(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  return asArray(data).map(j => ({
    source: 'lever',
    company: slug,
    title: j.text,
    link: j.hostedUrl,
    location: j.categories?.location || '',
    posted_at: j.createdAt ? new Date(j.createdAt).toISOString() : null,
    tags: Object.values(j.categories || {}).filter(Boolean),
    description: j.descriptionPlain || j.description || ''
  }));
}

async function fetchAshby(slug) {
  const data = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
  return asArray(data.jobs).map(j => ({
    source: 'ashby',
    company: slug,
    title: j.title,
    link: j.jobUrl,
    location: j.location || '',
    posted_at: j.publishedAt,
    description: j.descriptionPlain || j.descriptionHtml || ''
  }));
}

async function fetchSmartRecruiters(slug) {
  const data = await fetchJson(`https://api.smartrecruiters.com/v1/companies/${slug}/postings`);
  return asArray(data.content).map(j => ({
    source: 'smartrecruiters',
    company: slug,
    title: j.name,
    link: j.ref || `https://jobs.smartrecruiters.com/${slug}/${j.id}`,
    location: j.location?.city || '',
    posted_at: j.releasedDate,
    description: ''
  }));
}

async function fetchRecruitee(slug) {
  const data = await fetchJson(`https://${slug}.recruitee.com/api/offers/`);
  return asArray(data.offers).map(j => ({
    source: 'recruitee',
    company: slug,
    title: j.title,
    link: j.careers_url,
    location: j.location || '',
    posted_at: j.created_at,
    description: j.description || ''
  }));
}

async function fetchPersonio(slug) {
  const xml = await fetchText(`https://${slug}.jobs.personio.de/xml`);
  const positions = xml.split('<position>').slice(1);
  return positions.map(p => {
    const id = getTag(p, 'id');
    return {
      source: 'personio',
      company: slug,
      title: getTag(p, 'name'),
      link: `https://${slug}.jobs.personio.de/job/${id}`,
      location: getTag(p, 'office'),
      description: getTag(p, 'jobDescription')
    };
  });
}

async function fetchTeamtailor(slug) {
  const data = await fetchJson(`https://${slug}.teamtailor.com/api/v1/jobs`, {
    headers: { 'Api-Version': '20210218', 'Accept': 'application/vnd.api+json' }
  });
  return asArray(data.data).map(j => ({
    source: 'teamtailor',
    company: slug,
    title: j.attributes?.title || '',
    link: j.links?.careersite_job_url || '',
    location: j.attributes?.remote ? 'Remote' : j.attributes?.['location-city'] || '',
    posted_at: j.attributes?.created_at,
    description: j.attributes?.body || ''
  }));
}

async function fetchBreezyHR(slug) {
  const data = await fetchJson(`https://${slug}.breezy.hr/json`);
  return asArray(data).map(j => ({
    source: 'breezyhr',
    company: slug,
    title: j.name,
    link: j.url,
    location: j.location?.name || '',
    description: j.description || ''
  }));
}

async function fetchWorkable(slug) {
  const data = await fetchJson(`https://apply.workable.com/api/v1/widget/accounts/${slug}`);
  return asArray(data.jobs).map(j => ({
    source: 'workable',
    company: slug,
    title: j.title,
    link: j.url,
    location: j.location?.city || (j.location?.telecommuting ? 'Remote' : ''),
    description: j.description || ''
  }));
}

async function fetchAtsJobs() {
  const jobs = [];
  for (const slug of ATS_COMPANIES.greenhouse) jobs.push(...await safeFetch(`greenhouse:${slug}`, () => fetchGreenhouse(slug)));
  for (const slug of ATS_COMPANIES.lever) jobs.push(...await safeFetch(`lever:${slug}`, () => fetchLever(slug)));
  for (const slug of ATS_COMPANIES.ashby) jobs.push(...await safeFetch(`ashby:${slug}`, () => fetchAshby(slug)));
  for (const slug of ATS_COMPANIES.smartrecruiters) jobs.push(...await safeFetch(`smartrecruiters:${slug}`, () => fetchSmartRecruiters(slug)));
  for (const slug of ATS_COMPANIES.recruitee) jobs.push(...await safeFetch(`recruitee:${slug}`, () => fetchRecruitee(slug)));
  for (const slug of ATS_COMPANIES.personio) jobs.push(...await safeFetch(`personio:${slug}`, () => fetchPersonio(slug)));
  for (const slug of ATS_COMPANIES.teamtailor) jobs.push(...await safeFetch(`teamtailor:${slug}`, () => fetchTeamtailor(slug)));
  for (const slug of ATS_COMPANIES.breezyhr) jobs.push(...await safeFetch(`breezyhr:${slug}`, () => fetchBreezyHR(slug)));
  for (const slug of ATS_COMPANIES.workable) jobs.push(...await safeFetch(`workable:${slug}`, () => fetchWorkable(slug)));
  return jobs;
}

function mergeJobs(existing, incoming) {
  const byLink = new Map(existing.map(job => [job.link, job]));
  const merged = [...existing];
  let added = 0;
  let updated = 0;

  for (const job of incoming) {
    if (!job.link || byLink.has(job.link)) {
      if (job.link && byLink.has(job.link)) {
        const current = byLink.get(job.link);
        Object.assign(current, {
          ...job,
          applied: current.applied,
          date_found: current.date_found || job.date_found,
          notes: current.notes
        });
        updated += 1;
      }
      continue;
    }

    byLink.set(job.link, job);
    merged.push(job);
    added += 1;
  }

  return { merged, added, updated };
}

async function main() {
  saveSearchTargets();
  const existing = loadExisting();

  const sources = [
    ['remoteok', fetchRemoteOK],
    ['remotive', fetchRemotive],
    ['weworkremotely', fetchWeWorkRemotely],
    ['workingnomads', fetchWorkingNomads],
    ['jobspresso', fetchJobspresso],
    ['hackernews', fetchHackerNewsWhoIsHiring],
    ['yc-jobs', fetchYCombinatorJobs],
    ['ats', fetchAtsJobs]
  ];

  let fetched = [];
  for (const [name, fetcher] of sources) {
    fetched.push(...await safeFetch(name, fetcher));
  }

  const normalized = fetched
    .map(normalizeJob)
    .filter(matchesFilters)
    .filter(job => isWithinLast24Hours(job.posted_at));

  const unique = [];
  const seen = new Set();
  for (const job of normalized) {
    const key = job.link || `${job.company}|${job.title}|${job.location}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(job);
    }
  }

  const { merged, added, updated } = mergeJobs(existing, unique);
  const pruned = merged.filter(job => isWithinLast24Hours(job.posted_at));
  const removed = merged.length - pruned.length;
  saveAll(pruned);

  console.log(`Fetched ${fetched.length} raw jobs.`);
  console.log(`Matched ${unique.length} fully remote developer jobs posted in the last 24 hours.`);
  console.log(`Added ${added}, updated ${updated}, removed ${removed} stale listings.`);
  console.log(`Saved ${pruned.length} jobs within the 24-hour window.`);
  console.log(`Saved ${SEARCH_TARGETS.length} manual search targets to search-targets.json.`);
  console.log('Restricted/manual platforms to monitor:');
  for (const target of SEARCH_TARGETS) {
    console.log(`- ${target.category} / ${target.name}: ${target.url}`);
  }
}

main().catch(err => {
  console.error('Crawler crashed:', err);
  process.exitCode = 1;
});
