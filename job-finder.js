// Job Aggregator + Local Dashboard
// Setup: npm init -y && npm install express
// Fetch jobs:   node job-finder.js
// View dashboard: node server.js  -> open http://localhost:3000

const fs = require('fs');
const path = require('path');

const COMPANIES = {
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
    'retool', 'runway', 'sourcegraph'
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

const INCLUDE_KEYWORDS = [
  'full stack', 'fullstack', 'mern', 'react', 'node', 'laravel', 'php', 'javascript'
];

const EXCLUDE_KEYWORDS = [
  'principal', 'staff engineer', 'director', 'manager', 'on-site', 'hybrid'
];

// A job's location must contain at least one of these to be kept
const REMOTE_KEYWORDS = [
  'remote', 'worldwide', 'anywhere', 'work from home', 'wfh', 'distributed'
];

const DATA_FILE = path.join(__dirname, 'jobs.json');

function matchesFilters(title, location = '') {
  const titleText    = title.toLowerCase();
  const locationText = location.toLowerCase();

  const included  = INCLUDE_KEYWORDS.some(k => titleText.includes(k));
  const excluded  = EXCLUDE_KEYWORDS.some(k => titleText.includes(k));
  const isRemote  = REMOTE_KEYWORDS.some(k => locationText.includes(k));

  return included && !excluded && isRemote;
}

function loadExisting() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveAll(jobs) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(jobs, null, 2));
}

async function fetchGreenhouse(slug) {
  try {
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobs || []).map(j => ({
      company: slug,
      title: j.title,
      link: j.absolute_url,
      location: j.location?.name || ''
    }));
  } catch (e) {
    console.error(`Greenhouse ${slug} failed:`, e.message);
    return [];
  }
}

async function fetchLever(slug) {
  try {
    const res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).map(j => ({
      company: slug,
      title: j.text,
      link: j.hostedUrl,
      location: j.categories?.location || ''
    }));
  } catch (e) {
    console.error(`Lever ${slug} failed:`, e.message);
    return [];
  }
}

async function fetchAshby(slug) {
  try {
    const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobs || []).map(j => ({
      company: slug,
      title: j.title,
      link: j.jobUrl,
      location: j.location || ''
    }));
  } catch (e) {
    console.error(`Ashby ${slug} failed:`, e.message);
    return [];
  }
}

async function fetchRemoteOK() {
  try {
    const res = await fetch('https://remoteok.com/api');
    if (!res.ok) return [];
    const data = await res.json();
    return data
      .filter(j => j.position)
      .map(j => ({
        company: j.company,
        title: j.position,
        link: j.url,
        location: 'Remote'
      }));
  } catch (e) {
    console.error('RemoteOK failed:', e.message);
    return [];
  }
}

// SmartRecruiters: public posting API, no auth needed
async function fetchSmartRecruiters(slug) {
  try {
    const res = await fetch(`https://api.smartrecruiters.com/v1/companies/${slug}/postings`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.content || []).map(j => ({
      company: slug,
      title: j.name,
      link: j.ref || `https://jobs.smartrecruiters.com/${slug}/${j.id}`,
      location: j.location?.city || ''
    }));
  } catch (e) {
    console.error(`SmartRecruiters ${slug} failed:`, e.message);
    return [];
  }
}

// Recruitee: public careers API
async function fetchRecruitee(slug) {
  try {
    const res = await fetch(`https://${slug}.recruitee.com/api/offers/`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.offers || []).map(j => ({
      company: slug,
      title: j.title,
      link: j.careers_url,
      location: j.location || ''
    }));
  } catch (e) {
    console.error(`Recruitee ${slug} failed:`, e.message);
    return [];
  }
}

// Personio: public XML job feed (parsed lightly as text)
async function fetchPersonio(slug) {
  try {
    const res = await fetch(`https://${slug}.jobs.personio.de/xml`);
    if (!res.ok) return [];
    const xml = await res.text();
    const jobs = [];
    const positions = xml.split('<position>').slice(1);
    for (const p of positions) {
      const title = (p.match(/<name>(.*?)<\/name>/) || [])[1] || '';
      const id = (p.match(/<id>(.*?)<\/id>/) || [])[1] || '';
      const office = (p.match(/<office>(.*?)<\/office>/) || [])[1] || '';
      jobs.push({
        company: slug,
        title,
        link: `https://${slug}.jobs.personio.de/job/${id}`,
        location: office
      });
    }
    return jobs;
  } catch (e) {
    console.error(`Personio ${slug} failed:`, e.message);
    return [];
  }
}

// Teamtailor: public careers API (requires Api-Version header)
async function fetchTeamtailor(slug) {
  try {
    const res = await fetch(`https://${slug}.teamtailor.com/api/v1/jobs`, {
      headers: { 'Api-Version': '20210218', 'Accept': 'application/vnd.api+json' }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).map(j => ({
      company: slug,
      title: j.attributes?.title || '',
      link: j.links?.careersite_job_url || '',
      location: j.attributes?.['location-city'] || j.attributes?.remote ? 'Remote' : ''
    }));
  } catch (e) {
    console.error(`Teamtailor ${slug} failed:`, e.message);
    return [];
  }
}

// BreezyHR: public company postings JSON
async function fetchBreezyHR(slug) {
  try {
    const res = await fetch(`https://${slug}.breezy.hr/json`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).map(j => ({
      company: slug,
      title: j.name,
      link: j.url,
      location: j.location?.name || ''
    }));
  } catch (e) {
    console.error(`BreezyHR ${slug} failed:`, e.message);
    return [];
  }
}

// Workable: public job board API
async function fetchWorkable(slug) {
  try {
    const res = await fetch(`https://apply.workable.com/api/v1/widget/accounts/${slug}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobs || []).map(j => ({
      company: slug,
      title: j.title,
      link: j.url,
      location: j.location?.city || (j.location?.telecommuting ? 'Remote' : '')
    }));
  } catch (e) {
    console.error(`Workable ${slug} failed:`, e.message);
    return [];
  }
}

async function main() {
  const existing = loadExisting();
  const existingLinks = new Set(existing.map(j => j.link));

  let fetched = [];
  for (const slug of COMPANIES.greenhouse) fetched.push(...await fetchGreenhouse(slug));
  for (const slug of COMPANIES.lever) fetched.push(...await fetchLever(slug));
  for (const slug of COMPANIES.ashby) fetched.push(...await fetchAshby(slug));
  for (const slug of COMPANIES.smartrecruiters) fetched.push(...await fetchSmartRecruiters(slug));
  for (const slug of COMPANIES.recruitee) fetched.push(...await fetchRecruitee(slug));
  for (const slug of COMPANIES.personio) fetched.push(...await fetchPersonio(slug));
  for (const slug of COMPANIES.teamtailor) fetched.push(...await fetchTeamtailor(slug));
  for (const slug of COMPANIES.breezyhr) fetched.push(...await fetchBreezyHR(slug));
  for (const slug of COMPANIES.workable) fetched.push(...await fetchWorkable(slug));
  fetched.push(...await fetchRemoteOK());

  const today = new Date().toISOString().split('T')[0];

  const newJobs = fetched
    .filter(j => matchesFilters(j.title, j.location))
    .filter(j => !existingLinks.has(j.link))
    .map(j => ({ ...j, date_found: today, applied: false }));

  console.log(`Found ${newJobs.length} new matching jobs.`);
  saveAll([...existing, ...newJobs]);
}

main();