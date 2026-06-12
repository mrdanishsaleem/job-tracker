// State Management
let state = {
  jobs: [],
  selectedJob: null,
  activeFilter: 'all', // sidebar filter: 'all', 'interested', 'applied', etc.
  searchQuery: '',
  sourceFilter: '',
  sortBy: 'recent'
};

// DOM Elements
const jobsGrid = document.getElementById('jobs-grid');
const jobsLoading = document.getElementById('jobs-loading');
const jobsEmpty = document.getElementById('jobs-empty');
const searchInput = document.getElementById('search-input');
const filterSource = document.getElementById('filter-source');
const sortBySelect = document.getElementById('sort-by');
const navLinks = document.querySelectorAll('.nav-link');
const activeFiltersInfo = document.getElementById('active-filters-info');
const filterSummaryText = document.getElementById('filter-summary-text');
const btnClearSearch = document.getElementById('btn-clear-search');

// Sync Elements
const btnSync = document.getElementById('btn-sync');
const btnEmptySync = document.getElementById('btn-empty-sync');
const syncIcon = document.getElementById('sync-icon');
const syncStatus = document.getElementById('sync-status');

// Drawer Elements
const detailsDrawer = document.getElementById('details-drawer');
const drawerOverlay = document.getElementById('drawer-overlay');
const btnCloseDrawer = document.getElementById('btn-close-drawer');
const btnDeleteJob = document.getElementById('btn-delete-job');
const btnSaveNotes = document.getElementById('btn-save-notes');
const detailStatusSelect = document.getElementById('detail-status-select');
const detailAppliedDate = document.getElementById('detail-applied-date');
const detailNotes = document.getElementById('detail-notes');
const ratingContainer = document.getElementById('rating-container');

// Modal Elements
const addJobModal = document.getElementById('add-job-modal');
const btnAddJob = document.getElementById('btn-add-job');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelModal = document.getElementById('btn-cancel-modal');
const addJobForm = document.getElementById('add-job-form');

// Toast Container
const toastContainer = document.getElementById('toast-container');

// Core API Requests

// Fetch jobs from server
async function fetchJobs() {
  showLoading(true);
  try {
    // Construct request URL with query parameters
    const params = new URLSearchParams();
    
    // Server handles source and search filters directly
    if (state.sourceFilter) params.append('source', state.sourceFilter);
    if (state.searchQuery) params.append('search', state.searchQuery);
    
    // If filtering by status via sidebar (except "all")
    if (state.activeFilter !== 'all') {
      params.append('status', state.activeFilter);
    }
    
    const response = await fetch(`/api/jobs?${params.toString()}`);
    const result = await response.json();
    
    if (result.success) {
      state.jobs = result.data;
      
      // Perform local sorting
      sortJobs();
      
      // Render components
      renderJobsList();
      
      // Fetch all tracker statistics (we query all jobs once to get accurate status aggregates)
      await updateKPIStats();
    } else {
      showToast('error', 'Failed to load jobs from database.');
    }
  } catch (error) {
    console.error('Fetch error:', error);
    showToast('error', 'Network error. Could not reach server.');
  } finally {
    showLoading(false);
  }
}

// Trigger crawling sync
async function syncJobsList() {
  setSyncingState(true);
  showToast('info', 'Synchronizing with job board APIs...');
  
  try {
    const response = await fetch('/api/jobs/sync', { method: 'POST' });
    const result = await response.json();
    
    if (result.success) {
      const stats = result.stats;
      showToast('success', `Sync complete! Crawled ${stats.fetched} jobs. Added: ${stats.added}, Updated: ${stats.updated}`);
      
      // Refresh list
      await fetchJobs();
      
      // Update last sync label
      const nowStr = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      syncStatus.textContent = `Last synced: ${nowStr}`;
    } else {
      showToast('error', `Sync failed: ${result.error}`);
    }
  } catch (error) {
    console.error('Sync error:', error);
    showToast('error', 'Server error while running sync crawler.');
  } finally {
    setSyncingState(false);
  }
}

// Manually add a job
async function createManualJob(jobData) {
  try {
    const response = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jobData)
    });
    const result = await response.json();
    
    if (result.success) {
      showToast('success', 'Job listing added successfully.');
      closeModal();
      addJobForm.reset();
      await fetchJobs();
    } else {
      showToast('error', `Failed to create job: ${result.error}`);
    }
  } catch (error) {
    console.error('Creation error:', error);
    showToast('error', 'Network error while adding job.');
  }
}

// Update specific job fields (status, rating, notes, etc.)
async function updateJob(jobId, updates) {
  try {
    const response = await fetch(`/api/jobs/${jobId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    const result = await response.json();
    
    if (result.success) {
      // Update local state element
      const idx = state.jobs.findIndex(j => j.id === jobId);
      if (idx !== -1) {
        state.jobs[idx] = result.data;
      }
      
      // If we are currently showing this job, refresh details drawer
      if (state.selectedJob && state.selectedJob.id === jobId) {
        state.selectedJob = result.data;
        populateDrawerDetails(result.data);
      }
      
      // Re-fetch (especially if status filter requires elements to disappear)
      await fetchJobs();
      showToast('success', 'Application tracker updated.');
    } else {
      showToast('error', 'Failed to update job details.');
    }
  } catch (error) {
    console.error('Update error:', error);
    showToast('error', 'Network error. Update not saved.');
  }
}

// Delete job listing
async function deleteJob(jobId) {
  if (!confirm('Are you sure you want to delete this job listing? This action is permanent.')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
    const result = await response.json();
    
    if (result.success) {
      showToast('success', 'Job deleted successfully.');
      closeDrawer();
      await fetchJobs();
    } else {
      showToast('error', 'Failed to delete job listing.');
    }
  } catch (error) {
    console.error('Deletion error:', error);
    showToast('error', 'Network error while deleting.');
  }
}

// Helper methods & Sorting

function sortJobs() {
  if (state.sortBy === 'recent') {
    state.jobs.sort((a, b) => {
      const dateA = new Date(a.postedAt || a.createdAt);
      const dateB = new Date(b.postedAt || b.createdAt);
      return dateB - dateA;
    });
  } else if (state.sortBy === 'rating') {
    state.jobs.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  } else if (state.sortBy === 'company') {
    state.jobs.sort((a, b) => a.company.localeCompare(b.company));
  }
}

// Update KPI metric counters
async function updateKPIStats() {
  try {
    // Fetch all jobs unfiltered to count global stats
    const response = await fetch('/api/jobs');
    const result = await response.json();
    
    if (result.success) {
      const allJobs = result.data;
      
      const counts = {
        total: allJobs.length,
        applied: allJobs.filter(j => ['applied', 'interviewing', 'offer', 'rejected'].includes(j.status)).length,
        interviews: allJobs.filter(j => j.status === 'interviewing').length,
        offers: allJobs.filter(j => j.status === 'offer').length
      };
      
      document.getElementById('stat-total').textContent = counts.total;
      document.getElementById('stat-applied').textContent = counts.applied;
      document.getElementById('stat-interviews').textContent = counts.interviews;
      document.getElementById('stat-offers').textContent = counts.offers;
    }
  } catch (error) {
    console.error('Error fetching statistics:', error);
  }
}

// Render Job Grid Cards
function renderJobsList() {
  jobsGrid.innerHTML = '';
  
  // Update banner summarizing active filters
  updateFilterBanner();
  
  if (state.jobs.length === 0) {
    jobsEmpty.classList.remove('hidden');
    return;
  }
  
  jobsEmpty.classList.add('hidden');
  
  state.jobs.forEach(job => {
    const card = document.createElement('div');
    card.className = `job-card status-border-${job.status}`;
    card.dataset.id = job.id;
    
    // Logo element logic
    let logoHtml = '';
    if (job.logo) {
      logoHtml = `<img src="${job.logo}" alt="${job.company} Logo" onerror="this.outerHTML='${getFallbackLogo(job.company)}'">`;
    } else {
      logoHtml = getFallbackLogo(job.company);
    }
    
    // Description snippet (strip html tags first)
    const rawTextDesc = job.description.replace(/<[^>]*>/g, '');
    const excerpt = rawTextDesc.length > 120 ? rawTextDesc.substring(0, 120) + '...' : rawTextDesc;
    
    // Rating star previews
    let ratingStars = '';
    for (let i = 1; i <= 5; i++) {
      if (i <= (job.rating || 0)) {
        ratingStars += '<i class="fa-solid fa-star filled"></i>';
      } else {
        ratingStars += '<i class="fa-regular fa-star"></i>';
      }
    }
    
    // Format posted date
    const relativeDate = formatRelativeDate(job.postedAt);
    
    // Render tag snippets (max 3 tags on main view)
    let tagsHtml = '';
    if (job.tags && job.tags.length > 0) {
      job.tags.slice(0, 3).forEach(tag => {
        tagsHtml += `<span class="badge badge-outline">${tag}</span>`;
      });
    }

    card.innerHTML = `
      <div class="job-card-header">
        <div class="company-logo">${logoHtml}</div>
        <div class="job-title-block">
          <h3 title="${job.title}">${job.title}</h3>
          <span class="job-company" title="${job.company}">${job.company}</span>
        </div>
      </div>
      
      <div class="job-meta-details">
        <span><i class="fa-solid fa-location-dot"></i> ${job.location}</span>
        <span><i class="fa-solid fa-clock"></i> ${relativeDate}</span>
      </div>
      
      <div class="job-description-excerpt">${excerpt}</div>
      
      <div class="tag-cloud">
        ${tagsHtml}
        ${job.salary && job.salary !== 'Not specified' ? `<span class="badge badge-salary">${job.salary}</span>` : ''}
      </div>
      
      <div class="job-card-footer">
        <span class="badge badge-status badge-${job.status}">${job.status}</span>
        <div class="card-rating">${ratingStars}</div>
      </div>
    `;
    
    card.addEventListener('click', () => openDrawer(job));
    jobsGrid.appendChild(card);
  });
}

// Details Drawer Management
function openDrawer(job) {
  state.selectedJob = job;
  populateDrawerDetails(job);
  detailsDrawer.classList.add('open');
  drawerOverlay.classList.add('open');
}

function closeDrawer() {
  state.selectedJob = null;
  detailsDrawer.classList.remove('open');
  drawerOverlay.classList.remove('open');
}

function populateDrawerDetails(job) {
  document.getElementById('detail-source').textContent = job.source;
  document.getElementById('detail-title').textContent = job.title;
  document.getElementById('detail-company').textContent = job.company;
  document.getElementById('detail-location').textContent = job.location;
  document.getElementById('detail-salary').textContent = job.salary;
  document.getElementById('detail-type').textContent = job.jobType;
  document.getElementById('detail-date').textContent = `Posted ${formatRelativeDate(job.postedAt)}`;
  
  // Set logo
  const logoBox = document.getElementById('detail-logo-box');
  if (job.logo) {
    logoBox.innerHTML = `<img src="${job.logo}" alt="${job.company}" onerror="this.outerHTML='${getFallbackLogo(job.company)}'">`;
  } else {
    logoBox.innerHTML = getFallbackLogo(job.company);
  }
  
  // Description HTML
  document.getElementById('detail-description').innerHTML = job.description;
  
  // Tags cloud
  const tagsContainer = document.getElementById('detail-tags');
  tagsContainer.innerHTML = '';
  if (job.tags && job.tags.length > 0) {
    job.tags.forEach(tag => {
      const span = document.createElement('span');
      span.className = 'tag-badge';
      span.textContent = tag;
      tagsContainer.appendChild(span);
    });
  } else {
    tagsContainer.innerHTML = '<span class="text-muted text-xs">No tags provided</span>';
  }
  
  // Apply Link
  const applyBtn = document.getElementById('btn-apply-external');
  if (job.url && job.url !== '#') {
    applyBtn.href = job.url;
    applyBtn.style.display = 'inline-flex';
  } else {
    applyBtn.style.display = 'none';
  }

  // Tracking Panel Controls
  detailStatusSelect.value = job.status;
  
  // Update status select color styles dynamically if desired
  detailAppliedDate.value = job.appliedDate ? job.appliedDate.split('T')[0] : '';
  detailNotes.value = job.notes || '';
  
  // Show / Hide applied date picker based on status
  toggleAppliedDateVisibility(job.status);
  
  // Render Rating stars
  renderInteractiveStars(job.rating || 0);
}

// Active UI Stars handler
function renderInteractiveStars(rating) {
  const stars = ratingContainer.querySelectorAll('.star');
  stars.forEach(star => {
    const starVal = parseInt(star.dataset.rating);
    if (starVal <= rating) {
      star.className = 'fa-solid fa-star star active';
    } else {
      star.className = 'fa-regular fa-star star';
    }
  });
}

function toggleAppliedDateVisibility(status) {
  const row = detailAppliedDate.closest('.form-group');
  if (['applied', 'interviewing', 'offer', 'rejected'].includes(status)) {
    row.style.visibility = 'visible';
  } else {
    row.style.visibility = 'hidden';
  }
}

// Modal management
function openModal() {
  addJobModal.classList.add('open');
}

function closeModal() {
  addJobModal.classList.remove('open');
}

// Filters & Layout summaries
function updateFilterBanner() {
  const activeFilters = [];
  
  if (state.activeFilter !== 'all') {
    activeFilters.push(`status "${state.activeFilter}"`);
  }
  if (state.sourceFilter) {
    activeFilters.push(`source "${state.sourceFilter}"`);
  }
  if (state.searchQuery) {
    activeFilters.push(`keyword "${state.searchQuery}"`);
  }
  
  if (activeFilters.length > 0) {
    filterSummaryText.textContent = activeFilters.join(' + ');
    activeFiltersInfo.classList.remove('hidden');
  } else {
    activeFiltersInfo.classList.add('hidden');
  }
}

// Helper: Color generator for fallback logos
function getFallbackLogo(company) {
  const initial = company ? company.charAt(0) : '?';
  let hash = 0;
  for (let i = 0; i < company.length; i++) {
    hash = company.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  const bgColor = `hsl(${hue}, 60%, 42%)`;
  return `<div class="company-logo-fallback" style="background-color: ${bgColor}; display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; font-weight: 700; color: #fff;">${initial}</div>`;
}

// Helper: Relative Date strings formatting
function formatRelativeDate(dateString) {
  if (!dateString) return 'Unknown';
  const date = new Date(dateString);
  const now = new Date();
  
  // strip times
  const d1 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const d2 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const diffTime = d2 - d1;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return 'Just now';
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <= 7) return `${diffDays} days ago`;
  
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Helper: Toggle layouts loading
function showLoading(isLoading) {
  if (isLoading) {
    jobsLoading.classList.remove('hidden');
    jobsGrid.classList.add('hidden');
    jobsEmpty.classList.add('hidden');
  } else {
    jobsLoading.classList.add('hidden');
    jobsGrid.classList.remove('hidden');
  }
}

function setSyncingState(isSyncing) {
  if (isSyncing) {
    btnSync.disabled = true;
    btnEmptySync.disabled = true;
    syncIcon.classList.add('spin-fast');
    btnSync.querySelector('span').textContent = 'Syncing...';
  } else {
    btnSync.disabled = false;
    btnEmptySync.disabled = false;
    syncIcon.classList.remove('spin-fast');
    btnSync.querySelector('span').textContent = 'Sync Listings';
  }
}

// Helper: Create HTML alerts toaster popup
function showToast(type, message) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'fa-circle-info';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'error') icon = 'fa-circle-exclamation';
  
  toast.innerHTML = `
    <i class="fa-solid ${icon} toast-icon"></i>
    <div class="toast-body">${message}</div>
  `;
  
  toastContainer.appendChild(toast);
  
  // Slide out after 3.5 seconds
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s forwards cubic-bezier(0.16, 1, 0.3, 1)';
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, 3500);
}

// CSS slideOut injector helper
const styleSheet = document.createElement("style");
styleSheet.innerText = `
  @keyframes slideOut {
    to { transform: translateX(120%); opacity: 0; }
  }
  .status-border-interested { border-left: 4px solid var(--color-interested) !important; }
  .status-border-applied { border-left: 4px solid var(--color-applied) !important; }
  .status-border-interviewing { border-left: 4px solid var(--color-interviewing) !important; }
  .status-border-offer { border-left: 4px solid var(--color-offer) !important; }
  .status-border-rejected { border-left: 4px solid var(--color-rejected) !important; }
  .status-border-archived { border-left: 4px solid var(--color-archived) !important; }
`;
document.head.appendChild(styleSheet);


// Interactive Events setup

// Sidebar Filter changes
navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    navLinks.forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    
    state.activeFilter = link.dataset.statusFilter;
    fetchJobs();
    
    // close drawer on tab shift
    closeDrawer();
  });
});

// Search bar input with basic debounce
let searchTimeout;
searchInput.addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    state.searchQuery = e.target.value.trim();
    fetchJobs();
  }, 300);
});

btnClearSearch.addEventListener('click', () => {
  searchInput.value = '';
  state.searchQuery = '';
  fetchJobs();
});

// Select Dropdowns filters
filterSource.addEventListener('change', (e) => {
  state.sourceFilter = e.target.value;
  fetchJobs();
});

sortBySelect.addEventListener('change', (e) => {
  state.sortBy = e.target.value;
  sortJobs();
  renderJobsList();
});

// Sync triggers
btnSync.addEventListener('click', syncJobsList);
btnEmptySync.addEventListener('click', syncJobsList);

// Drawer interactions
btnCloseDrawer.addEventListener('click', closeDrawer);
drawerOverlay.addEventListener('click', closeDrawer);

// Rating stars clicks
ratingContainer.addEventListener('click', (e) => {
  if (e.target.classList.contains('star')) {
    const clickedRating = parseInt(e.target.dataset.rating);
    
    // Update local state temporarily (saved on 'Save' button click or blur)
    if (state.selectedJob) {
      state.selectedJob.tempRating = clickedRating;
      renderInteractiveStars(clickedRating);
    }
  }
});

// Save changes button (applied date, note, status, rating)
btnSaveNotes.addEventListener('click', async () => {
  if (!state.selectedJob) return;
  
  const ratingToSave = state.selectedJob.tempRating !== undefined 
    ? state.selectedJob.tempRating 
    : state.selectedJob.rating;
    
  const updates = {
    status: detailStatusSelect.value,
    appliedDate: detailAppliedDate.value || null,
    notes: detailNotes.value,
    rating: ratingToSave || 0
  };
  
  await updateJob(state.selectedJob.id, updates);
});

// Change status visibility trigger inside drawer
detailStatusSelect.addEventListener('change', (e) => {
  toggleAppliedDateVisibility(e.target.value);
});

// Delete job handler
btnDeleteJob.addEventListener('click', () => {
  if (state.selectedJob) {
    deleteJob(state.selectedJob.id);
  }
});

// Modal triggers
btnAddJob.addEventListener('click', openModal);
btnCloseModal.addEventListener('click', closeModal);
btnCancelModal.addEventListener('click', closeModal);

// Form submission for manual job
addJobForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  const title = document.getElementById('form-title').value.trim();
  const company = document.getElementById('form-company').value.trim();
  const location = document.getElementById('form-location').value.trim();
  const salary = document.getElementById('form-salary').value.trim();
  const jobType = document.getElementById('form-type').value;
  const url = document.getElementById('form-url').value.trim();
  const logo = document.getElementById('form-logo').value.trim();
  
  // Parse tags comma string to array
  const rawTags = document.getElementById('form-tags').value;
  const tags = rawTags 
    ? rawTags.split(',').map(t => t.trim().toLowerCase()).filter(t => t !== '') 
    : [];
    
  const description = document.getElementById('form-description').value.trim();
  
  createManualJob({
    title,
    company,
    location,
    salary,
    jobType,
    url,
    logo,
    tags,
    description
  });
});

// App Entry Initialization
window.addEventListener('DOMContentLoaded', () => {
  fetchJobs();
});
