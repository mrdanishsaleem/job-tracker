// Multi-source remote job crawler.
// Fetch jobs: npm run find
// View dashboard: npm start -> http://localhost:3000

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'jobs.json');

const INCLUDE_KEYWORDS = [
  'full stack', 'fullstack', 'mern', 'react', 'node', 'node.js', 'laravel',
  'php', 'javascript', 'typescript', 'frontend', 'front end', 'backend', 'back end'
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
    'nearform', 'elastic', 'digitalocean', 'sentry', 'dbtlabs', 'grafana',
    'postman', 'coursera', 'circleci', 'automattic', 'clever', 'khanacademy'
  ],
  lever: [
    'netflix', 'shopify', 'framer', 'vercel', 'hotjar', 'doist', 'toptal',
    'buffer', 'close', 'ghost', 'gitbook', 'gorgias', 'miro', 'superhuman',
    'shippo', 'coderpad', 'posthog', 'logrocket', 'stack-overflow'
  ],
  ashby: [
    'ramp', 'mercury', 'deel', 'notion', 'linear', 'vanta', 'replit',
    'zapier', 'clay', 'harvey', 'gorgias', 'ironclad', 'lemonade', 'lime',
    'retool', 'runway', 'sourcegraph', 'canonical'
  ],
  smartrecruiters: [
    'Visa', 'Bosch', 'Equinix', 'Ubisoft', 'Skechers', 'AveryDennison'
  ],
  recruitee: [],
  personio: [
    'aboutyou', 'taxfix', 'getyourguide', 'flightright'
  ],
  teamtailor: [],
  breezyhr: [],
  workable: [
    'babbel', 'feedly', 'deliveroo'
  ]
};

const SEARCH_TARGETS = [
  {
    source: 'linkedin-search',
    url: 'https://www.linkedin.com/jobs/search/?keywords=remote%20full%20stack%20react%20node%20laravel',
    reason: 'LinkedIn blocks reliable unauthenticated scraping; monitor manually or use an approved API/provider.'
  },
  {
    source: 'indeed-search',
    url: 'https://www.indeed.com/jobs?q=remote+full+stack+react+node+laravel&l=Remote',
    reason: 'Indeed blocks/special-cases scraping; monitor manually or use an approved API/provider.'
  },
  {
    source: 'google-ats-greenhouse',
    url: 'https://www.google.com/search?q=site%3Aboards.greenhouse.io+remote+%22full+stack%22',
    reason: 'Search result pages should not be scraped here; use as a manual discovery source for new company slugs.'
  },
  {
    source: 'google-ats-lever',
    url: 'https://www.google.com/search?q=site%3Ajobs.lever.co+remote+react',
    reason: 'Search result pages should not be scraped here; use as a manual discovery source for new company slugs.'
  },
  {
    source: 'google-ats-ashby',
    url: 'https://www.google.com/search?q=site%3Ajobs.ashbyhq.com+remote+laravel+OR+%22full+stack%22',
    reason: 'Search result pages should not be scraped here; use as a manual discovery source for new company slugs.'
  }
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
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveAll(jobs) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(jobs, null, 2));
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
  const xml = await fetchText('https://www.workingnomads.com/jobs.rss');
  return parseRssItems(xml).map(item => ({
    source: 'workingnomads',
    company: 'Working Nomads',
    title: getTag(item, 'title'),
    link: getTag(item, 'link'),
    location: 'Remote',
    posted_at: getTag(item, 'pubDate'),
    description: getTag(item, 'description')
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
  const data = await fetchJson('https://www.ycombinator.com/jobs/api/jobs?remote=true');
  return asArray(data).map(j => ({
    source: 'yc-jobs',
    company: j.company?.name || j.company_name || 'Y Combinator',
    title: j.title,
    link: j.url || `https://www.ycombinator.com/companies/${j.company?.slug || ''}/jobs/${j.id || ''}`,
    location: j.location || 'Remote',
    posted_at: j.created_at || j.createdAt,
    salary: j.salary,
    tags: asArray(j.tags),
    description: j.description || ''
  }));
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
    .filter(matchesFilters);

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
  saveAll(merged);

  console.log(`Fetched ${fetched.length} raw jobs.`);
  console.log(`Matched ${unique.length} fully remote developer jobs.`);
  console.log(`Added ${added}, updated ${updated}.`);
  console.log('Restricted/manual platforms to monitor:');
  for (const target of SEARCH_TARGETS) {
    console.log(`- ${target.source}: ${target.url}`);
  }
}

main().catch(err => {
  console.error('Crawler crashed:', err);
  process.exitCode = 1;
});
