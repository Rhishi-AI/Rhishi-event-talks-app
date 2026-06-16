// Global State Manager
let allReleaseNotes = []; // Raw parsed entries
let parsedSubItems = [];  // Granular individual notes (split by h3 tags)
let filteredSubItems = []; // Items matching search/filter

// Configuration for Tweet Generator
const HASHTAGS_POOL = [
    { text: '#BigQuery', active: true, category: 'general' },
    { text: '#GCP', active: true, category: 'general' },
    { text: '#CloudRelease', active: true, category: 'general' },
    { text: '#DataAnalytics', active: false, category: 'general' },
    { text: '#GeminiAI', active: false, category: 'ai' },
    { text: '#SQL', active: false, category: 'sql' },
    { text: '#CloudComputing', active: false, category: 'general' }
];

let selectedHashtags = [];

// DOM Elements Cache
const elements = {
    btnRefresh: document.getElementById('btn-refresh'),
    btnExportCSV: document.getElementById('btn-export-csv'),
    themeToggle: document.getElementById('theme-toggle'),
    searchInput: document.getElementById('search-input'),
    clearSearchBtn: document.getElementById('clear-search-btn'),
    filterType: document.getElementById('filter-type'),
    feedLoader: document.getElementById('feed-loader'),
    feedError: document.getElementById('feed-error'),
    feedEmpty: document.getElementById('feed-empty'),
    feedContainer: document.getElementById('release-notes-feed'),
    errorMessage: document.getElementById('error-message'),
    btnErrorRetry: document.getElementById('btn-error-retry'),
    btnResetFilters: document.getElementById('btn-reset-filters'),
    
    // Stats elements
    statTotalReleases: document.getElementById('stat-total-releases').querySelector('.stat-value'),
    statTotalItems: document.getElementById('stat-total-items').querySelector('.stat-value'),
    progressFeatures: document.getElementById('progress-features'),
    progressIssues: document.getElementById('progress-issues'),
    progressDeprecations: document.getElementById('progress-deprecations'),
    countFeatures: document.getElementById('count-features'),
    countIssues: document.getElementById('count-issues'),
    countDeprecations: document.getElementById('count-deprecations'),
    
    // Modal elements
    tweetModal: document.getElementById('tweet-modal'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    tweetPreviewText: document.getElementById('tweet-preview-text'),
    tweetEditorTextarea: document.getElementById('tweet-editor-textarea'),
    tweetCharCount: document.getElementById('tweet-char-count'),
    tweetWarningMsg: document.getElementById('tweet-warning-msg'),
    charProgressCircle: document.getElementById('char-progress-circle'),
    hashtagContainer: document.getElementById('hashtag-container'),
    btnCopyTweet: document.getElementById('btn-copy-tweet'),
    btnShareX: document.getElementById('btn-share-x'),
    toastContainer: document.getElementById('toast-container')
};

// Initialize Application on DOM Content Loaded
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    // Event Listeners for controls
    elements.btnRefresh.addEventListener('click', fetchReleaseNotes);
    elements.btnExportCSV.addEventListener('click', exportToCSV);
    elements.btnErrorRetry.addEventListener('click', fetchReleaseNotes);
    elements.btnResetFilters.addEventListener('click', resetFilters);
    
    elements.searchInput.addEventListener('input', handleSearchInput);
    elements.clearSearchBtn.addEventListener('click', () => {
        elements.searchInput.value = '';
        elements.clearSearchBtn.style.display = 'none';
        applyFiltersAndRender();
    });
    
    elements.filterType.addEventListener('change', applyFiltersAndRender);
    
    // Modal controls
    elements.btnCloseModal.addEventListener('click', closeModal);
    elements.tweetModal.addEventListener('click', (e) => {
        if (e.target === elements.tweetModal) closeModal();
    });
    
    elements.tweetEditorTextarea.addEventListener('input', handleTweetEditorInput);
    elements.btnCopyTweet.addEventListener('click', copyDraftTweet);
    elements.btnShareX.addEventListener('click', postToX);

    // Theme Toggle Initialization & Setup
    elements.themeToggle.addEventListener('change', toggleTheme);
    
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        elements.themeToggle.checked = true;
        document.body.classList.add('light-theme');
    } else {
        elements.themeToggle.checked = false;
        document.body.classList.remove('light-theme');
    }
    updateThemeIconStates();

    // Initial load
    fetchReleaseNotes();
}

// Fetch Raw RSS Entries from Flask Backend API
async function fetchReleaseNotes() {
    showState('loading');
    setRefreshButtonState(true);
    
    try {
        const response = await fetch('/api/release-notes');
        const result = await response.json();
        
        if (result.status === 'success' && Array.isArray(result.data)) {
            allReleaseNotes = result.data;
            processAndParseEntries();
            applyFiltersAndRender();
            showToast('Feed fetched and parsed successfully!', 'success');
        } else {
            throw new Error(result.message || 'Malformed API response');
        }
    } catch (err) {
        console.error('Error fetching release notes:', err);
        elements.errorMessage.textContent = `Failed to download or parse Google Cloud RSS feed: ${err.message}.`;
        showState('error');
        showToast('Failed to refresh release notes', 'error');
    } finally {
        setRefreshButtonState(false);
    }
}

// Set Loading Spinning animation on Navbar Refresh Button
function setRefreshButtonState(isSpinning) {
    const icon = elements.btnRefresh.querySelector('i');
    if (isSpinning) {
        icon.classList.add('spinning');
        elements.btnRefresh.disabled = true;
    } else {
        icon.classList.remove('spinning');
        elements.btnRefresh.disabled = false;
    }
}

// Parse Raw HTML in Atom entries into Granular Sub-Items (One card per H3 category update)
function processAndParseEntries() {
    parsedSubItems = [];
    const parser = new DOMParser();
    
    allReleaseNotes.forEach((entry, entryIndex) => {
        const doc = parser.parseFromString(entry.content, 'text/html');
        
        // Loop through children in body to extract sub-sections separated by <h3>
        let currentType = 'General';
        let currentBodyNodes = [];
        
        const children = Array.from(doc.body.children);
        
        children.forEach((child, childIndex) => {
            if (child.tagName === 'H3') {
                // If we already have accumulated nodes, package the previous section
                if (currentBodyNodes.length > 0) {
                    saveSubItem(entry, currentType, currentBodyNodes, entryIndex);
                    currentBodyNodes = [];
                }
                currentType = child.textContent.trim();
            } else {
                currentBodyNodes.push(child.outerHTML);
            }
        });
        
        // Package the trailing section
        if (currentBodyNodes.length > 0) {
            saveSubItem(entry, currentType, currentBodyNodes, entryIndex);
        }
        
        // Fallback if there were no children or H3s, save whole content as General
        if (children.length === 0 && entry.content) {
            parsedSubItems.push({
                id: `note-${entryIndex}-fb`,
                date: entry.title,
                rawDate: entry.updated,
                type: 'General',
                contentHtml: entry.content,
                sourceLink: entry.link
            });
        }
    });
    
    // Sort parsed items by updated date descending
    parsedSubItems.sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate));
}

// Helper to push processed items into parsedSubItems list
function saveSubItem(entry, type, bodyNodes, entryIndex) {
    // Generate clean type
    let cleanType = 'General';
    if (type.toLowerCase().includes('feature')) cleanType = 'Feature';
    else if (type.toLowerCase().includes('issue') || type.toLowerCase().includes('bug')) cleanType = 'Issue';
    else if (type.toLowerCase().includes('deprecation')) cleanType = 'Deprecation';
    
    const idSuffix = Math.random().toString(36).substring(2, 7);
    parsedSubItems.push({
        id: `note-${entryIndex}-${cleanType.toLowerCase()}-${idSuffix}`,
        date: entry.title,
        rawDate: entry.updated,
        type: cleanType,
        contentHtml: bodyNodes.join(''),
        sourceLink: entry.link
    });
}

// Stats / Metrics Dashboard Calculations
function calculateAndRenderStats() {
    const totalReleases = allReleaseNotes.length;
    const totalItems = filteredSubItems.length;
    
    elements.statTotalReleases.textContent = totalReleases;
    elements.statTotalItems.textContent = totalItems;
    
    // Count types in all parsed sub-items to keep proportions accurate to current database
    let featuresCount = 0;
    let issuesCount = 0;
    let deprecationsCount = 0;
    
    parsedSubItems.forEach(item => {
        if (item.type === 'Feature') featuresCount++;
        else if (item.type === 'Issue') issuesCount++;
        else if (item.type === 'Deprecation') deprecationsCount++;
    });
    
    elements.countFeatures.textContent = featuresCount;
    elements.countIssues.textContent = issuesCount;
    elements.countDeprecations.textContent = deprecationsCount;
    
    const totalCount = featuresCount + issuesCount + deprecationsCount;
    if (totalCount > 0) {
        const featPct = (featuresCount / totalCount) * 100;
        const issPct = (issuesCount / totalCount) * 100;
        const depPct = (deprecationsCount / totalCount) * 100;
        
        elements.progressFeatures.style.width = `${featPct}%`;
        elements.progressIssues.style.width = `${issPct}%`;
        elements.progressDeprecations.style.width = `${depPct}%`;
    } else {
        elements.progressFeatures.style.width = `0%`;
        elements.progressIssues.style.width = `0%`;
        elements.progressDeprecations.style.width = `0%`;
    }
}

// Search Handler
function handleSearchInput() {
    const val = elements.searchInput.value.trim();
    if (val.length > 0) {
        elements.clearSearchBtn.style.display = 'block';
    } else {
        elements.clearSearchBtn.style.display = 'none';
    }
    applyFiltersAndRender();
}

// Apply Selected Filter Options and Render UI Feed
function applyFiltersAndRender() {
    const searchVal = elements.searchInput.value.toLowerCase().trim();
    const typeFilter = elements.filterType.value;
    
    filteredSubItems = parsedSubItems.filter(item => {
        // 1. Type Filter
        if (typeFilter !== 'all' && item.type !== typeFilter) {
            return false;
        }
        
        // 2. Keyword Search
        if (searchVal.length > 0) {
            const dateMatch = item.date.toLowerCase().includes(searchVal);
            const contentMatch = item.contentHtml.toLowerCase().includes(searchVal);
            const typeMatch = item.type.toLowerCase().includes(searchVal);
            return dateMatch || contentMatch || typeMatch;
        }
        
        return true;
    });
    
    calculateAndRenderStats();
    
    if (filteredSubItems.length === 0) {
        showState('empty');
    } else {
        renderFeedTimeline();
        showState('feed');
    }
}

// Reset Search Inputs and Type Selectors
function resetFilters() {
    elements.searchInput.value = '';
    elements.filterType.value = 'all';
    elements.clearSearchBtn.style.display = 'none';
    applyFiltersAndRender();
    showToast('Filters cleared successfully', 'success');
}

// Group Filtered Sub-Items by Date and Inject HTML Cards
function renderFeedTimeline() {
    elements.feedContainer.innerHTML = '';
    
    // Group subitems by Date Header
    const groups = {};
    filteredSubItems.forEach(item => {
        if (!groups[item.date]) {
            groups[item.date] = [];
        }
        groups[item.date].push(item);
    });
    
    // Sort dates by their raw entries
    const sortedDates = Object.keys(groups).sort((a, b) => {
        const itemA = groups[a][0];
        const itemB = groups[b][0];
        return new Date(itemB.rawDate) - new Date(itemA.rawDate);
    });
    
    sortedDates.forEach(dateText => {
        const groupEl = document.createElement('div');
        groupEl.className = 'timeline-group';
        
        // Insert Header Date Timeline Anchor
        const headerEl = document.createElement('h2');
        headerEl.className = 'timeline-date-header';
        headerEl.textContent = dateText;
        groupEl.appendChild(headerEl);
        
        // Cards container
        const cardsContainer = document.createElement('div');
        cardsContainer.className = 'timeline-cards';
        
        groups[dateText].forEach(item => {
            const cardEl = document.createElement('div');
            cardEl.className = 'note-card';
            cardEl.id = item.id;
            
            // Apply custom CSS variable for color accents
            let typeColor = 'var(--color-general)';
            let typeColorRgb = 'var(--color-general-rgb)';
            if (item.type === 'Feature') {
                typeColor = 'var(--color-feature)';
                typeColorRgb = 'var(--color-feature-rgb)';
            } else if (item.type === 'Issue') {
                typeColor = 'var(--color-issue)';
                typeColorRgb = 'var(--color-issue-rgb)';
            } else if (item.type === 'Deprecation') {
                typeColor = 'var(--color-deprecation)';
                typeColorRgb = 'var(--color-deprecation-rgb)';
            }
            
            cardEl.style.setProperty('--type-color', typeColor);
            cardEl.style.setProperty('--type-color-rgb', typeColorRgb);
            
            // Card Top Banner Details
            const headerRow = document.createElement('div');
            headerRow.className = 'note-card-header';
            
            const badge = document.createElement('span');
            badge.className = 'type-badge';
            
            let iconHtml = '<i class="fa-solid fa-bell"></i>';
            if (item.type === 'Feature') iconHtml = '<i class="fa-solid fa-circle-check"></i>';
            else if (item.type === 'Issue') iconHtml = '<i class="fa-solid fa-triangle-exclamation"></i>';
            else if (item.type === 'Deprecation') iconHtml = '<i class="fa-solid fa-ban"></i>';
            
            badge.innerHTML = `${iconHtml} ${item.type}`;
            headerRow.appendChild(badge);
            
            if (item.sourceLink) {
                const srcLink = document.createElement('a');
                srcLink.className = 'note-source-link';
                srcLink.href = item.sourceLink;
                srcLink.target = '_blank';
                srcLink.rel = 'noopener noreferrer';
                srcLink.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square"></i> Live Docs';
                headerRow.appendChild(srcLink);
            }
            cardEl.appendChild(headerRow);
            
            // Content text area
            const contentRow = document.createElement('div');
            contentRow.className = 'note-card-content';
            contentRow.innerHTML = item.contentHtml;
            cardEl.appendChild(contentRow);
            
            // Card bottom Action Bar
            const actionsRow = document.createElement('div');
            actionsRow.className = 'note-card-actions';
            
            // Copy Direct Anchor link
            const btnCopy = document.createElement('button');
            btnCopy.className = 'btn-card-action';
            btnCopy.innerHTML = '<i class="fa-solid fa-link"></i> Copy Link';
            btnCopy.addEventListener('click', () => {
                const anchorUrl = item.sourceLink || `${window.location.origin}/#${item.id}`;
                copyToClipboard(anchorUrl, 'Direct release link copied to clipboard!');
            });
            actionsRow.appendChild(btnCopy);
            
            // Copy Update Content Text
            const btnCopyText = document.createElement('button');
            btnCopyText.className = 'btn-card-action';
            btnCopyText.innerHTML = '<i class="fa-regular fa-clipboard"></i> Copy Update';
            btnCopyText.addEventListener('click', () => {
                const plainText = cleanHtmlToPlainText(item.contentHtml);
                const copyPayload = `BigQuery ${item.type} (${item.date}):\n${plainText.trim()}`;
                copyToClipboard(copyPayload, 'Update content copied to clipboard!');
            });
            actionsRow.appendChild(btnCopyText);
            
            // Open Tweet Composer Button
            const btnTweet = document.createElement('button');
            btnTweet.className = 'btn-card-action btn-tweet-action';
            btnTweet.innerHTML = '<i class="fa-brands fa-x-twitter"></i> Draft Tweet';
            btnTweet.addEventListener('click', () => {
                openTweetComposer(item);
            });
            actionsRow.appendChild(btnTweet);
            
            cardEl.appendChild(actionsRow);
            cardsContainer.appendChild(cardEl);
        });
        
        groupEl.appendChild(cardsContainer);
        elements.feedContainer.appendChild(groupEl);
    });
}

// UI State Switcher Utility
function showState(state) {
    elements.feedLoader.style.display = state === 'loading' ? 'flex' : 'none';
    elements.feedError.style.display = state === 'error' ? 'flex' : 'none';
    elements.feedEmpty.style.display = state === 'empty' ? 'flex' : 'none';
    elements.feedContainer.style.display = state === 'feed' ? 'block' : 'none';
}

// Clipboard Copy Utility
function copyToClipboard(text, successMsg) {
    navigator.clipboard.writeText(text).then(() => {
        showToast(successMsg, 'success');
    }).catch(err => {
        console.error('Clipboard copy error:', err);
        showToast('Failed to copy. Please copy manually.', 'error');
    });
}

// Toast Feedback Notification system
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconClass = 'fa-circle-info';
    if (type === 'success') iconClass = 'fa-circle-check';
    else if (type === 'error') iconClass = 'fa-circle-exclamation';
    
    toast.innerHTML = `
        <i class="fa-solid ${iconClass} toast-icon"></i>
        <span class="toast-message">${message}</span>
    `;
    
    elements.toastContainer.appendChild(toast);
    
    // Force reflow and animate in
    setTimeout(() => {
        toast.classList.add('active');
    }, 10);
    
    // Auto remove after 3s
    setTimeout(() => {
        toast.classList.remove('active');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// HTML stripper to convert release note tags into clean plain text for Tweets
function cleanHtmlToPlainText(html) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // Replace hyperlinks with text + link formats if reasonable, or just extract text
    // Remove links because we'll append the official document URL anyway
    return tempDiv.textContent || tempDiv.innerText || "";
}

// Open X Share Tweet Composer Modal & Pre-Draft Beautiful Tweets
function openTweetComposer(item) {
    const cleanContent = cleanHtmlToPlainText(item.contentHtml);
    
    // Generate premium tweet draft
    let categoryEmoji = '🚀';
    if (item.type === 'Issue') categoryEmoji = '⚠️';
    else if (item.type === 'Deprecation') categoryEmoji = '🛑';
    
    // Truncate clean content to preserve character budgets for links and tags
    let contentSummary = cleanContent.trim();
    if (contentSummary.length > 150) {
        contentSummary = contentSummary.substring(0, 145) + '...';
    }
    
    // Detect context triggers to automatically toggle relevant hashtags
    HASHTAGS_POOL.forEach(tag => {
        tag.active = tag.category === 'general'; // Default general active
        
        if (tag.category === 'ai' && (cleanContent.toLowerCase().includes('gemini') || cleanContent.toLowerCase().includes('ai') || cleanContent.toLowerCase().includes('assist'))) {
            tag.active = true;
        }
        if (tag.category === 'sql' && (cleanContent.toLowerCase().includes('sql') || cleanContent.toLowerCase().includes('query'))) {
            tag.active = true;
        }
    });
    
    renderHashtagButtons();
    
    // Set official doc link or direct link
    const shareLink = item.sourceLink || `${window.location.origin}/#${item.id}`;
    
    // Compose
    const draftText = `${categoryEmoji} New BigQuery ${item.type} (${item.date}):\n"${contentSummary}"\n\nRead more:\n${shareLink}\n\n${getActiveHashtagsString()}`;
    
    elements.tweetEditorTextarea.value = draftText;
    updateTweetPreviews();
    
    // Trigger modal active display
    elements.tweetModal.classList.add('active');
    document.body.style.overflow = 'hidden'; // Lock background scrolling
}

// Close Modal Handler
function closeModal() {
    elements.tweetModal.classList.remove('active');
    document.body.style.overflow = ''; // Unlock scroll
}

// Dynamic rendering of selectable Hashtags in Modal
function renderHashtagButtons() {
    elements.hashtagContainer.innerHTML = '';
    
    HASHTAGS_POOL.forEach((tag, index) => {
        const btn = document.createElement('button');
        btn.className = `tag-toggle-btn ${tag.active ? 'active' : ''}`;
        btn.textContent = tag.text;
        
        btn.addEventListener('click', () => {
            tag.active = !tag.active;
            btn.classList.toggle('active', tag.active);
            
            // Re-draft the tweet with the updated tags
            updateTweetHashtags();
        });
        
        elements.hashtagContainer.appendChild(btn);
    });
}

// Get raw string of currently selected hashtags
function getActiveHashtagsString() {
    return HASHTAGS_POOL.filter(t => t.active).map(t => t.text).join(' ');
}

// Handle real-time updates when user edits standard text or toggles hashtag buttons
function updateTweetHashtags() {
    let currentText = elements.tweetEditorTextarea.value;
    
    // Parse out old hashtags at the end of the text if any
    const allTagsList = HASHTAGS_POOL.map(t => t.text);
    
    // Split lines and clean
    let lines = currentText.split('\n');
    let lastLine = lines[lines.length - 1];
    
    // Check if last line contains only our known hashtags
    const words = lastLine.split(' ');
    const isTagOnlyLine = words.every(word => word === '' || allTagsList.includes(word));
    
    const newTagsString = getActiveHashtagsString();
    
    if (isTagOnlyLine) {
        if (newTagsString) {
            lines[lines.length - 1] = newTagsString;
        } else {
            lines.pop(); // Remove the empty line
        }
    } else {
        if (newTagsString) {
            lines.push(newTagsString);
        }
    }
    
    elements.tweetEditorTextarea.value = lines.join('\n');
    updateTweetPreviews();
}

// Handle Editor Input Change in Modal
function handleTweetEditorInput() {
    updateTweetPreviews();
}

// Sync Editor Text to the X Card Preview and update Character limit circles
function updateTweetPreviews() {
    const text = elements.tweetEditorTextarea.value;
    elements.tweetPreviewText.innerText = text;
    
    const len = text.length;
    elements.tweetCharCount.textContent = `${len} / 280`;
    
    // Handle circle progress math
    const radius = 10;
    const circ = 2 * Math.PI * radius;
    elements.charProgressCircle.style.strokeDasharray = `${circ} ${circ}`;
    
    const percent = Math.min((len / 280) * 100, 100);
    const offset = circ - (percent / 100) * circ;
    elements.charProgressCircle.style.strokeDashoffset = offset;
    
    // Change circle progress color based on character counts
    if (len > 280) {
        elements.charProgressCircle.style.stroke = 'var(--color-issue)';
        elements.tweetWarningMsg.style.display = 'block';
        elements.tweetCharCount.style.color = 'var(--color-issue)';
        elements.btnShareX.disabled = true;
    } else {
        elements.tweetWarningMsg.style.display = 'none';
        elements.tweetCharCount.style.color = 'var(--text-secondary)';
        elements.btnShareX.disabled = false;
        
        if (len >= 260) {
            elements.charProgressCircle.style.stroke = 'var(--color-deprecation)';
        } else {
            elements.charProgressCircle.style.stroke = 'var(--color-feature)';
        }
    }
}

// Copy drafted text to Clipboard from Modal
function copyDraftTweet() {
    const text = elements.tweetEditorTextarea.value;
    copyToClipboard(text, 'Tweet draft copied to clipboard!');
}

// Trigger standard X web sharing Intent URL
function postToX() {
    const text = elements.tweetEditorTextarea.value;
    const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(shareUrl, '_blank', 'noopener,noreferrer');
    showToast('Redirected to X (Twitter) composer!', 'success');
}

// Export currently filtered release notes to a standard CSV file
function exportToCSV() {
    if (filteredSubItems.length === 0) {
        showToast('No release notes to export!', 'error');
        return;
    }
    
    const headers = ['Date', 'Type', 'Content', 'Link'];
    const rows = filteredSubItems.map(item => [
        item.date,
        item.type,
        cleanHtmlToPlainText(item.contentHtml).replace(/\s+/g, ' ').trim(),
        item.sourceLink || ''
    ]);
    
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(val => `"${val.replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `bigquery_release_notes_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Release notes exported to CSV successfully!', 'success');
}

// Swaps the active color scheme by adding/removing the 'light-theme' class on body
function toggleTheme() {
    const isLight = elements.themeToggle.checked;
    if (isLight) {
        document.body.classList.add('light-theme');
        localStorage.setItem('theme', 'light');
        showToast('Swapped to Light Theme', 'success');
    } else {
        document.body.classList.remove('light-theme');
        localStorage.setItem('theme', 'dark');
        showToast('Swapped to Dark Theme', 'success');
    }
    updateThemeIconStates();
}

// Synchronizes the active/inactive state (colors) of the moon & sun navbar icons
function updateThemeIconStates() {
    const isLight = elements.themeToggle.checked;
    const moonIcon = document.querySelector('.theme-toggle-wrapper .fa-moon');
    const sunIcon = document.querySelector('.theme-toggle-wrapper .fa-sun');
    if (isLight) {
        if (moonIcon) moonIcon.classList.remove('active');
        if (sunIcon) sunIcon.classList.add('active');
    } else {
        if (moonIcon) moonIcon.classList.add('active');
        if (sunIcon) sunIcon.classList.remove('active');
    }
}
