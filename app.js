// === DOM Elements ===
const screens = {
    landing: document.getElementById('landing-screen'),
    adminLogin: document.getElementById('admin-login-overlay'),
    waiting: document.getElementById('waiting-screen'),
    meeting: document.getElementById('meeting-screen')
};

// Landing
const inputJoinName = document.getElementById('join-name');
const btnRequestJoin = document.getElementById('btn-request-join');
const joinError = document.getElementById('join-error');
const btnShowAdminLogin = document.getElementById('btn-show-admin-login');
const permissionModal = document.getElementById('permission-modal');
const btnClosePermission = document.getElementById('btn-close-permission');

// Preview Section
const previewSection = document.getElementById('preview-section');
const previewVideo = document.getElementById('preview-video');
const btnPreviewAudio = document.getElementById('btn-preview-audio');
const btnPreviewVideo = document.getElementById('btn-preview-video');
const btnPrejoinMic = document.getElementById('btn-prejoin-mic');
const btnPrejoinCam = document.getElementById('btn-prejoin-cam');
const txtPrejoinMic = document.getElementById('txt-prejoin-mic');
const txtPrejoinCam = document.getElementById('txt-prejoin-cam');
const iconPrejoinMic = document.getElementById('icon-prejoin-mic');
const iconPrejoinCam = document.getElementById('icon-prejoin-cam');

// Pre-Join Modal Elements
const prejoinOptionsModal = document.getElementById('prejoin-options-modal');
const modalCardCam = document.getElementById('modal-card-cam');
const modalCardMic = document.getElementById('modal-card-mic');
const modalIconCamBox = document.getElementById('modal-icon-cam-box');
const modalIconMicBox = document.getElementById('modal-icon-mic-box');
const modalIconCam = document.getElementById('modal-icon-cam');
const modalIconMic = document.getElementById('modal-icon-mic');
const modalPillCam = document.getElementById('modal-pill-cam');
const modalPillMic = document.getElementById('modal-pill-mic');
const modalSubCam = document.getElementById('modal-sub-cam');
const modalSubMic = document.getElementById('modal-sub-mic');
const btnPrejoinModalConfirm = document.getElementById('btn-prejoin-modal-confirm');

// Admin Login
const inputAdminId = document.getElementById('admin-id');
const inputAdminPass = document.getElementById('admin-pass');
const btnAdminLogin = document.getElementById('btn-admin-login');
const btnCancelAdmin = document.getElementById('btn-cancel-admin');
const loginError = document.getElementById('login-error');

// Admin Controls
const adminControlsHeader = document.getElementById('admin-controls-header');
const inputInviteLink = document.getElementById('invite-link');
const btnCopyLink = document.getElementById('btn-copy-link');
const adminSidebar = document.getElementById('admin-sidebar');
const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
const btnCloseSidebar = document.getElementById('btn-close-sidebar');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const mobileRequestBadge = document.getElementById('mobile-request-badge');
const requestsList = document.getElementById('requests-list');
const requestCount = document.getElementById('request-count');
const noRequests = document.getElementById('no-requests');
const btnRecord = document.getElementById('btn-record');
const btnScreenShare = document.getElementById('btn-screen-share');
const recordingIndicator = document.getElementById('recording-indicator');

// Meeting Controls
const videoAreaGrid = document.getElementById('video-grid');
const focusPanel = document.getElementById('focus-panel');
const focusContainer = document.getElementById('focus-container');
const focusVideo = document.getElementById('focus-video');
const focusName = document.getElementById('focus-name');
const focusPlaceholder = document.getElementById('focus-placeholder');
const btnStageFullscreenEnter = document.getElementById('btn-stage-fullscreen-enter');
const btnStageFullscreenExit = document.getElementById('btn-stage-fullscreen-exit');
const participantsPanel = document.getElementById('participants-panel');
const localVideo = document.getElementById('local-video');
const btnToggleAudio = document.getElementById('btn-toggle-audio');
const btnToggleVideo = document.getElementById('btn-toggle-video');
const btnRaiseHand = document.getElementById('btn-raise-hand');
const btnLeave = document.getElementById('btn-leave');
const meetingFooter = document.getElementById('meeting-footer');
const meetingRoleBadge = document.getElementById('meeting-role-badge');
const meetingFlowCopy = document.getElementById('meeting-flow-copy');
const stageTitle = document.getElementById('stage-title');
const stageCopy = document.getElementById('stage-copy');
const presenterChip = document.getElementById('presenter-chip');
const recordingChip = document.getElementById('recording-chip');
const gridCopy = document.getElementById('grid-copy');

// === State ===
let isAdmin = false;
let isCoHost = false;
let peer = null;
let localStream = null;
let adminPeerId = null;
let myName = "";
let isHandRaised = false;
let isLocalVideoEnabled = true;
let isLocalAudioEnabled = true;

// Full Mesh state
// peerId -> { name, connection, call, stream }
const peersData = new Map(); 
const pendingRequests = new Map(); // Admin only

// Recording & Screen Share state
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let isScreenSharing = false;
let screenStream = null;
let currentSharer = null;
let currentSharerRole = null;
let remoteAudioUnlocked = false;
let recordingCanvas = null;
let recordingCanvasContext = null;
let recordingSourceVideo = null;
let recordingAnimationFrame = null;
let recordingCanvasStream = null;
const MIC_AUDIO_CONSTRAINTS = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1
};
const RECORDING_AUDIO_BOOST = 1.9;
const MAX_RECORDING_EDGE = 3840;

let audioContext;
let audioDestination;
let recordingMixCompressorNode = null;
let recordingMixGainNode = null;
const recordingAudioSources = new Map();
let reconnectTimer = null;
let orientationLockRequested = false;
let isManualStageFullscreen = false;
let stageControlsHideTimer = null;
let meetingClosed = false;
const HEARTBEAT_INTERVAL_MS = 10000;
const HEARTBEAT_TIMEOUT_MS = 30000;
const MEDIA_RETRY_DELAY_MS = 3000;
const connectionHeartbeatTimers = new Map();
const mediaRetryTimers = new Map();

// === Google Drive Integration State & Credentials ===
const GOOGLE_CLIENT_ID = '438319694586-444djih2pr18991pe60cj71975jkfnqv.apps.googleusercontent.com';
const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
let driveAccessToken = null;

function updateDriveStatusUI(connected) {
    const btnConnectDrive = document.getElementById('btn-connect-drive');
    const driveStatusText = document.getElementById('drive-status-text');
    if (!btnConnectDrive || !driveStatusText) return;

    if (isAdmin || isCoHost) {
        btnConnectDrive.classList.remove('hidden');
        btnConnectDrive.classList.add('inline-flex');
    }

    if (connected) {
        btnConnectDrive.classList.remove('border-sky-500/30', 'bg-sky-500/10', 'text-sky-300');
        btnConnectDrive.classList.add('border-emerald-500/30', 'bg-emerald-500/10', 'text-emerald-300');
        driveStatusText.textContent = 'Drive Connected';
    } else {
        btnConnectDrive.classList.remove('border-emerald-500/30', 'bg-emerald-500/10', 'text-emerald-300');
        btnConnectDrive.classList.add('border-sky-500/30', 'bg-sky-500/10', 'text-sky-300');
        driveStatusText.textContent = 'Connect Drive';
    }
}

function requestGoogleDriveToken() {
    return new Promise((resolve, reject) => {
        if (driveAccessToken) {
            return resolve(driveAccessToken);
        }

        if (typeof google === 'undefined' || !google?.accounts?.oauth2) {
            return reject(new Error('Google Identity Services script not loaded. Please check network connection.'));
        }

        const client = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: GOOGLE_DRIVE_SCOPE,
            callback: (response) => {
                if (response.error) {
                    return reject(new Error(response.error_description || response.error));
                }
                driveAccessToken = response.access_token;
                updateDriveStatusUI(true);
                resolve(driveAccessToken);
            },
            error_callback: (err) => reject(err)
        });

        client.requestAccessToken();
    });
}

async function uploadToGoogleDrive(blob, fileName) {
    const toast = document.getElementById('drive-upload-toast');
    const toastTitle = document.getElementById('drive-toast-title');
    const toastStatus = document.getElementById('drive-toast-status');
    const toastIcon = document.getElementById('drive-toast-icon');
    const toastLink = document.getElementById('drive-toast-link');

    if (toast) {
        toast.classList.remove('hidden-section');
        if (toastTitle) toastTitle.textContent = 'Uploading to Google Drive...';
        if (toastStatus) toastStatus.textContent = 'Connecting...';
        if (toastIcon) toastIcon.className = 'fa-solid fa-cloud-arrow-up text-lg animate-bounce text-sky-400';
        if (toastLink) toastLink.classList.add('hidden');
    }

    try {
        const token = await requestGoogleDriveToken();

        if (toastStatus) toastStatus.textContent = 'Initiating Drive upload...';

        const metadata = {
            name: fileName,
            mimeType: 'video/webm'
        };

        const initRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json; charset=UTF-8',
                'X-Upload-Content-Type': 'video/webm',
                'X-Upload-Content-Length': blob.size
            },
            body: JSON.stringify(metadata)
        });

        if (!initRes.ok) {
            const errTxt = await initRes.text();
            throw new Error(`Drive session failed (${initRes.status}): ${errTxt}`);
        }

        const uploadUrl = initRes.headers.get('Location');
        if (!uploadUrl) {
            throw new Error('No upload session URL received from Google Drive.');
        }

        const fileData = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', uploadUrl, true);
            xhr.setRequestHeader('Content-Type', 'video/webm');

            if (xhr.upload) {
                xhr.upload.onprogress = (evt) => {
                    if (evt.lengthComputable && toastStatus) {
                        const percent = Math.round((evt.loaded / evt.total) * 100);
                        toastStatus.textContent = `${percent}% completed`;
                    }
                };
            }

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        resolve(JSON.parse(xhr.responseText));
                    } catch (e) {
                        resolve({ id: null });
                    }
                } else {
                    reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
                }
            };

            xhr.onerror = () => reject(new Error('Network error during Google Drive upload.'));
            xhr.send(blob);
        });

        if (toast) {
            if (toastTitle) toastTitle.textContent = 'Saved to Google Drive!';
            if (toastStatus) toastStatus.textContent = 'Upload complete';
            if (toastIcon) toastIcon.className = 'fa-solid fa-circle-check text-lg text-emerald-400';

            if (fileData?.id && toastLink) {
                toastLink.href = `https://drive.google.com/file/d/${fileData.id}/view`;
                toastLink.classList.remove('hidden');
            }

            setTimeout(() => {
                toast.classList.add('hidden-section');
            }, 12000);
        }

        return fileData;
    } catch (err) {
        console.error('Google Drive Upload Error:', err);
        if (toast) {
            if (toastTitle) toastTitle.textContent = 'Google Drive Upload Notice';
            if (toastStatus) toastStatus.textContent = err.message || 'Error uploading file';
            if (toastIcon) toastIcon.className = 'fa-solid fa-triangle-exclamation text-lg text-amber-400';
            setTimeout(() => toast.classList.add('hidden-section'), 8000);
        }
    }
}

// === Initialization ===
function init() {
    const localContainer = document.getElementById('video-container-local');
    if (localContainer) {
        ensureParticipantDecorations(localContainer, 'You');
    }

    setMeetingRoleUI();
    setPresentationLayout(false);
    setRecordingUI(false);
    setScreenShareButtonState(false);

    const hash = window.location.hash.substring(1);
    if (hash) {
        adminPeerId = hash;
        document.body.classList.add('invite-entry-mode');
        btnShowAdminLogin.classList.add('hidden');
        
        // Present the pre-join camera/mic modal popup so user has full control before camera starts
        if (prejoinOptionsModal) {
            prejoinOptionsModal.classList.remove('hidden-section');
        }
        if (previewSection) {
            previewSection.classList.remove('hidden');
        }
    } else {
        document.body.classList.remove('invite-entry-mode');
    }
    updatePrejoinUI();
    setupEventListeners();
    if (focusVideo) {
        focusVideo.addEventListener('loadedmetadata', updateStageViewportSizing);
        focusVideo.addEventListener('resize', updateStageViewportSizing);
    }
    document.addEventListener('fullscreenchange', updateStageViewportSizing);
    document.addEventListener('webkitfullscreenchange', updateStageViewportSizing);
    window.addEventListener('resize', () => {
        syncSidebarForViewport();
        syncPresentationViewportMode(Boolean(currentSharer), currentSharerRole);
        updateStageViewportSizing();
    });
}

function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.add('hidden-section'));
    if (screens[screenName]) {
        screens[screenName].classList.remove('hidden-section');
    }
}

function buildInviteLink(peerId) {
    const url = new URL(window.location.href);
    url.hash = peerId;
    return url.toString();
}

function getCurrentPresentationState() {
    if (!currentSharer) return null;

    const isLocalSharer = currentSharer === 'local';
    const sharerPeerId = isLocalSharer ? peer?.id : currentSharer;
    if (!sharerPeerId) return null;

    const remotePeerData = isLocalSharer ? null : peersData.get(currentSharer);
    return {
        peerId: sharerPeerId,
        sharerName: isLocalSharer ? (myName || 'You') : (remotePeerData?.name || 'Presenter'),
        role: isLocalSharer
            ? getLocalRoleKey()
            : (currentSharerRole || remotePeerData?.role || 'participant')
    };
}

function syncFocusVideoFromPresentationState(presentation) {
    if (!focusVideo || !presentation?.peerId) return;

    const isLocalSharer = peer?.id && presentation.peerId === peer.id;
    const targetStream = isLocalSharer
        ? screenStream
        : peersData.get(presentation.peerId)?.stream;

    if (!targetStream) return;

    focusVideo.srcObject = targetStream;
    focusVideo.play().catch(err => console.error('Focus video play failed:', err));
    requestAnimationFrame(updateStageViewportSizing);
}

function applyPresentationState(presentation) {
    if (!presentation?.peerId) return;

    const isLocalSharer = peer?.id && presentation.peerId === peer.id;
    if (isScreenSharing && currentSharer === 'local' && !isLocalSharer) {
        return;
    }

    currentSharer = isLocalSharer ? 'local' : presentation.peerId;
    currentSharerRole = presentation.role || 'participant';

    setPresentationLayout(true, presentation.sharerName || 'Presenter', isLocalSharer, currentSharerRole);
    if (focusName) {
        focusName.innerText = `${presentation.sharerName || (isLocalSharer ? 'You' : 'Presenter')} (Screen)`;
    }

    syncFocusVideoFromPresentationState(presentation);
}

function sendCurrentPresentationState(conn) {
    if (!conn || !conn.open) return;

    const presentation = getCurrentPresentationState();
    if (!presentation) return;

    conn.send({
        type: 'presentation-state',
        presentation
    });
}

function stopConnectionHeartbeat(peerId) {
    if (!connectionHeartbeatTimers.has(peerId)) return;
    clearInterval(connectionHeartbeatTimers.get(peerId));
    connectionHeartbeatTimers.delete(peerId);
}

function markConnectionAlive(conn) {
    if (!conn) return;
    conn.lastSeenAt = Date.now();
}

function endMeetingSession(reason = 'Meeting ended by host.') {
    if (meetingClosed) return;
    meetingClosed = true;

    if (reason) {
        alert(reason);
    }

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }

    if (peer && !peer.destroyed) {
        try {
            peer.destroy();
        } catch (err) {
            console.debug('Peer destroy skipped during endMeetingSession:', err);
        }
    }

    window.location.reload();
}

function broadcastMeetingEnded(reason = 'Meeting ended by host.') {
    peersData.forEach(peerData => {
        if (peerData.connection?.open) {
            peerData.connection.send({ type: 'meeting-ended', reason });
        }
    });

    pendingRequests.forEach(request => {
        if (request.conn?.open) {
            request.conn.send({ type: 'meeting-ended', reason });
        }
    });
}

function startConnectionHeartbeat(conn) {
    if (!conn?.peer) return;

    stopConnectionHeartbeat(conn.peer);
    markConnectionAlive(conn);

    const timer = setInterval(() => {
        if (!conn.open) return;

        try {
            conn.send({ type: 'heartbeat', ts: Date.now() });
        } catch (err) {
            console.debug('Heartbeat send failed:', err);
        }

        if (!isAdmin && conn.peer === adminPeerId) {
            const lastSeenAt = conn.lastSeenAt || 0;
            if (Date.now() - lastSeenAt > HEARTBEAT_TIMEOUT_MS) {
                endMeetingSession('Host disconnected. Meeting ended.');
            }
        }
    }, HEARTBEAT_INTERVAL_MS);

    connectionHeartbeatTimers.set(conn.peer, timer);
}

function stopMediaReconnect(peerId) {
    if (!mediaRetryTimers.has(peerId)) return;
    clearTimeout(mediaRetryTimers.get(peerId));
    mediaRetryTimers.delete(peerId);
}

function createCallMetadata(extra = {}) {
    return {
        name: myName,
        role: getLocalRoleKey(),
        isVideoEnabled: isLocalVideoEnabled,
        isAudioEnabled: isLocalAudioEnabled,
        ...extra
    };
}

function scheduleMediaReconnect(peerId) {
    if (!peerId || !peer || peer.destroyed || mediaRetryTimers.has(peerId)) return;

    const peerData = peersData.get(peerId);
    if (!peerData?.shouldInitiateCalls || !peerData.connection?.open) return;

    const timer = setTimeout(() => {
        mediaRetryTimers.delete(peerId);

        const latestPeerData = peersData.get(peerId);
        if (!latestPeerData?.shouldInitiateCalls || !latestPeerData.connection?.open || !peer || peer.destroyed) {
            return;
        }

        const connectionState = latestPeerData.call?.peerConnection?.connectionState;
        const iceState = latestPeerData.call?.peerConnection?.iceConnectionState;
        const looksBroken = ['failed', 'disconnected'].includes(connectionState)
            || ['failed', 'disconnected'].includes(iceState);

        if (!latestPeerData.call || looksBroken) {
            try {
                latestPeerData.call?.close();
            } catch (err) {
                console.debug('Previous call close skipped before retry:', err);
            }

            const retryCall = peer.call(peerId, getActiveStream(), {
                metadata: createCallMetadata()
            });
            setupCallListeners(retryCall, latestPeerData.name || 'User', { initiatedLocally: true });
        }
    }, MEDIA_RETRY_DELAY_MS);

    mediaRetryTimers.set(peerId, timer);
}

async function copyTextToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const tempInput = document.createElement('textarea');
    tempInput.value = text;
    tempInput.setAttribute('readonly', '');
    tempInput.style.position = 'absolute';
    tempInput.style.left = '-9999px';
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
}

function schedulePeerReconnect() {
    if (!peer || peer.destroyed || reconnectTimer) return;

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;

        if (!peer || peer.destroyed || !peer.disconnected) return;

        try {
            peer.reconnect();
        } catch (err) {
            console.error('Peer reconnect failed:', err);
        }
    }, 1500);
}

function isDesktopViewport() {
    return window.innerWidth >= 768;
}

function getLocalRoleKey() {
    if (isAdmin) return 'host';
    if (isCoHost) return 'cohost';
    return 'participant';
}

function isHostLikeRole(role) {
    return role === 'host' || role === 'cohost';
}

function resetStageViewportSizing() {
    if (!focusContainer) return;

    focusContainer.style.width = '';
    focusContainer.style.height = '';
    focusContainer.style.aspectRatio = '';
    focusContainer.style.maxWidth = '';
    focusContainer.style.maxHeight = '';
}

function updateStageViewportSizing() {
    if (!focusPanel || !focusContainer || !focusVideo) return;

    if (!currentSharer) {
        resetStageViewportSizing();
        return;
    }

    focusContainer.style.width = '100%';
    focusContainer.style.height = '100%';
    focusContainer.style.maxWidth = '100%';
    focusContainer.style.maxHeight = '100%';
}

async function tryLockLandscapePresentation() {
    if (orientationLockRequested || !screen.orientation || !screen.orientation.lock) return;

    try {
        await screen.orientation.lock('landscape');
        orientationLockRequested = true;
    } catch (err) {
        console.debug('Orientation lock not available:', err);
    }
}

function releaseLandscapePresentationLock() {
    if (!screen.orientation || !screen.orientation.unlock) return;

    try {
        screen.orientation.unlock();
    } catch (err) {
        console.debug('Orientation unlock not available:', err);
    }

    orientationLockRequested = false;
}

function syncPresentationViewportMode(active = Boolean(currentSharer), sharerRole = currentSharerRole) {
    const shouldPrioritizeStage = active && !isDesktopViewport();
    document.body.classList.toggle('mobile-stage-priority', shouldPrioritizeStage);

    if (!shouldPrioritizeStage && !isManualStageFullscreen) {
        releaseLandscapePresentationLock();
    }
    syncStageFullscreenButtons(active);
}

function clearStageControlsHideTimer() {
    if (stageControlsHideTimer) {
        clearTimeout(stageControlsHideTimer);
        stageControlsHideTimer = null;
    }
}

function getActiveFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function syncStageFullscreenButtons(isPresenting = Boolean(currentSharer)) {
    if (!btnStageFullscreenEnter || !btnStageFullscreenExit) return;

    btnStageFullscreenEnter.classList.toggle('hidden', !isPresenting || isManualStageFullscreen);
    btnStageFullscreenExit.classList.toggle('hidden', !isPresenting || !isManualStageFullscreen);
}

function showStageFullscreenControlsTemporarily(duration = 2600) {
    if (!isManualStageFullscreen) return;

    document.body.classList.add('manual-stage-controls-visible');
    clearStageControlsHideTimer();
    stageControlsHideTimer = setTimeout(() => {
        document.body.classList.remove('manual-stage-controls-visible');
        stageControlsHideTimer = null;
    }, duration);
}

function applyManualStageFullscreenState(active) {
    isManualStageFullscreen = active;
    document.body.classList.toggle('manual-stage-fullscreen', active);
    document.body.classList.toggle('manual-stage-controls-visible', active);

    if (!active) {
        clearStageControlsHideTimer();
        document.body.classList.remove('manual-stage-controls-visible');
        releaseLandscapePresentationLock();
    } else {
        showStageFullscreenControlsTemporarily();
    }

    syncStageFullscreenButtons(Boolean(currentSharer));
    requestAnimationFrame(updateStageViewportSizing);
}

async function enterManualStageFullscreen() {
    if (!currentSharer || isManualStageFullscreen) return;

    applyManualStageFullscreenState(true);

    try {
        const fullscreenTarget = screens.meeting || document.documentElement;
        const requestFullscreenFn = fullscreenTarget.requestFullscreen || fullscreenTarget.webkitRequestFullscreen;
        if (!getActiveFullscreenElement() && requestFullscreenFn) {
            await requestFullscreenFn.call(fullscreenTarget);
        }
    } catch (err) {
        console.debug('Fullscreen request not available:', err);
    }

    await tryLockLandscapePresentation();
}

async function exitManualStageFullscreen() {
    if (!isManualStageFullscreen) return;

    applyManualStageFullscreenState(false);

    try {
        const exitFullscreenFn = document.exitFullscreen || document.webkitExitFullscreen;
        if (getActiveFullscreenElement() && exitFullscreenFn) {
            await exitFullscreenFn.call(document);
        }
    } catch (err) {
        console.debug('Fullscreen exit not available:', err);
    }
}

function handleBrowserFullscreenChange() {
    if (!getActiveFullscreenElement() && isManualStageFullscreen) {
        applyManualStageFullscreenState(false);
    }
}

function updatePeerRole(peerId, role) {
    if (!peerId || !role) return;

    const peerData = peersData.get(peerId);
    if (peerData) {
        peerData.role = role;
    }

    if (currentSharer === peerId) {
        currentSharerRole = role;
        syncPresentationViewportMode(true, currentSharerRole);
        updateVideoGridLayout();
    }
}

function broadcastPeerRoleUpdate(peerId, role) {
    peersData.forEach((peerData, id) => {
        if (id === peerId || !peerData.connection) return;

        peerData.connection.send({
            type: 'peer-role-update',
            peerId,
            role
        });
    });
}

function syncSidebarForViewport() {
    if (!adminSidebar) return;

    if (isAdmin && isDesktopViewport()) {
        adminSidebar.classList.remove('hidden', 'translate-x-full');
        adminSidebar.classList.add('flex');
        if (sidebarBackdrop) {
            sidebarBackdrop.classList.add('hidden', 'opacity-0', 'pointer-events-none');
            sidebarBackdrop.classList.remove('opacity-100', 'pointer-events-auto');
        }
        return;
    }

    adminSidebar.classList.add('hidden', 'translate-x-full');
    adminSidebar.classList.remove('flex');
    if (sidebarBackdrop) {
        sidebarBackdrop.classList.add('hidden', 'opacity-0', 'pointer-events-none');
        sidebarBackdrop.classList.remove('opacity-100', 'pointer-events-auto');
    }
}

function setMeetingRoleUI() {
    if (!meetingRoleBadge || !meetingFlowCopy) return;

    if (isAdmin) {
        meetingRoleBadge.innerHTML = '<i class="fa-solid fa-crown text-brand-400"></i> Host';
        meetingFlowCopy.textContent = 'Recording saves on this device.';
        return;
    }

    if (isCoHost) {
        meetingRoleBadge.innerHTML = '<i class="fa-solid fa-star text-brand-400"></i> Co-host';
        meetingFlowCopy.textContent = 'Host controls recording from the main device.';
        return;
    }

    meetingRoleBadge.innerHTML = '<i class="fa-solid fa-user-group text-brand-400"></i> Participant';
    meetingFlowCopy.textContent = 'Join and present from your own device.';
}

function setRecordButtonState(active) {
    if (!btnRecord) return;

    btnRecord.classList.remove('bg-slate-800', 'bg-red-600', 'text-slate-300', 'text-white');
    if (active) {
        btnRecord.classList.add('bg-red-600', 'text-white');
    } else {
        btnRecord.classList.add('bg-slate-800', 'text-slate-300');
    }
}

function setScreenShareButtonState(active) {
    if (!btnScreenShare) return;

    btnScreenShare.classList.remove('bg-slate-800', 'bg-brand-600', 'text-slate-300', 'text-white');
    if (active) {
        btnScreenShare.classList.add('bg-brand-600', 'text-white');
    } else {
        btnScreenShare.classList.add('bg-slate-800', 'text-slate-300');
    }
}

function setRecordingUI(active) {
    if (recordingIndicator) {
        recordingIndicator.classList.toggle('hidden', !active);
        recordingIndicator.classList.toggle('flex', active);
    }

    if (recordingChip) {
        recordingChip.innerHTML = active
            ? '<i class="fa-solid fa-circle-dot text-red-400"></i> Recording on host laptop'
            : '<i class="fa-solid fa-circle-dot text-amber-400"></i> Recording idle';
    }

    setRecordButtonState(active);
}

function getInitials(name) {
    const source = (name || 'User').trim();
    if (!source) return 'U';

    const parts = source.split(/\s+/).slice(0, 2);
    return parts.map(part => part[0]).join('').toUpperCase();
}

function ensureParticipantDecorations(container, name) {
    let avatar = container.querySelector('.avatar-placeholder');
    if (!avatar) {
        avatar = document.createElement('div');
        avatar.className = 'avatar-placeholder hidden';
        avatar.innerHTML = `<div class="avatar-badge">${getInitials(name)}</div>`;
        container.appendChild(avatar);
    } else {
        const badge = avatar.querySelector('.avatar-badge');
        if (badge) badge.textContent = getInitials(name);
    }

    let cameraBadge = container.querySelector('.camera-state-badge');
    if (!cameraBadge) {
        cameraBadge = document.createElement('div');
        cameraBadge.className = 'camera-state-badge hidden';
        cameraBadge.innerHTML = '<i class="fa-solid fa-video-slash text-xs"></i>';
        container.appendChild(cameraBadge);
    }
}

function setParticipantVideoState(id, enabled, fallbackName = 'User') {
    const container = document.getElementById(`video-container-${id}`);
    const participantName = id === 'local' ? 'You' : (peersData.get(id)?.name || fallbackName);

    if (id === 'local') {
        isLocalVideoEnabled = enabled;
    } else {
        const participant = peersData.get(id);
        if (participant) participant.isVideoEnabled = enabled;
    }

    if (!container) return;

    ensureParticipantDecorations(container, participantName);
    container.classList.toggle('video-off-mode', !enabled);

    const video = container.querySelector('video');
    if (video) {
        video.style.opacity = enabled ? '1' : '0';
    }

    const avatar = container.querySelector('.avatar-placeholder');
    if (avatar) {
        avatar.classList.toggle('hidden', enabled);
    }

    const cameraBadge = container.querySelector('.camera-state-badge');
    if (cameraBadge) {
        cameraBadge.classList.toggle('hidden', enabled);
    }
}

function removeRemoteAudioButton(container) {
    const existingBtn = container?.querySelector('.remote-audio-btn');
    if (existingBtn) existingBtn.remove();
}

function showRemoteAudioButton(video, container) {
    if (!container || container.querySelector('.remote-audio-btn')) return;

    const button = document.createElement('button');
    button.className = 'remote-audio-btn absolute top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-600 px-4 py-2.5 text-xs font-bold text-white shadow-2xl transition hover:bg-brand-500 flex items-center gap-2 border border-white/20 animate-pulse';
    button.innerHTML = '<i class="fa-solid fa-volume-high"></i> <span>শব্দ শুনতে ট্যাপ করুন</span>';
    button.onclick = async (e) => {
        e.stopPropagation();
        unlockRemoteAudioPlayback();
        removeRemoteAudioButton(container);
    };
    container.appendChild(button);
}

function attachRemoteAudio(id, stream) {
    if (!stream) return;

    let audio = document.getElementById(`remote-audio-${id}`);
    if (!audio) {
        audio = document.createElement('audio');
        audio.id = `remote-audio-${id}`;
        audio.autoplay = true;
        audio.playsInline = true;
        audio.style.display = 'none';
        document.body.appendChild(audio);
    }
    if (audio.srcObject !== stream) {
        audio.srcObject = stream;
    }
    audio.muted = false;
    audio.defaultMuted = false;
    audio.volume = 1.0;

    const playPromise = audio.play();
    if (playPromise !== undefined) {
        playPromise.catch(err => {
            console.debug('Autoplay deferred for remote audio until user interaction:', id, err);
            const container = document.getElementById(`video-container-${id}`);
            if (container) showRemoteAudioButton(null, container);
        });
    }
}

async function syncRemoteVideoPlayback(video, container) {
    if (!video) return;

    if (video.id === 'local-video' || container?.id === 'video-container-local') {
        video.muted = true;
        video.defaultMuted = true;
        video.play().catch(() => {});
        return;
    }

    video.autoplay = true;
    video.playsInline = true;
    video.dataset.remoteVideo = 'true';
    video.muted = false;
    video.defaultMuted = false;
    video.volume = 1.0;

    try {
        await video.play();
        removeRemoteAudioButton(container);
    } catch (err) {
        console.warn('Initial unmuted video play blocked, falling back to muted video + audio element:', err);
        video.muted = true;
        video.defaultMuted = true;
        try {
            await video.play();
        } catch (playErr) {
            console.error('Muted remote video playback failed:', playErr);
        }
        showRemoteAudioButton(video, container);
    }
}

function unlockRemoteAudioPlayback() {
    remoteAudioUnlocked = true;

    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
    }

    document.querySelectorAll('audio[id^="remote-audio-"]').forEach(audio => {
        audio.muted = false;
        audio.defaultMuted = false;
        audio.volume = 1.0;
        if (audio.paused) {
            audio.play().catch(err => console.debug('Audio element play retry:', err));
        }
    });

    document.querySelectorAll('video[data-remote-video="true"]').forEach(video => {
        video.muted = false;
        video.defaultMuted = false;
        video.volume = 1.0;
        if (video.paused) {
            video.play().catch(err => {
                const container = video.closest('.video-container');
                if (container) showRemoteAudioButton(video, container);
            });
        } else {
            const container = video.closest('.video-container');
            if (container) removeRemoteAudioButton(container);
        }
    });
}

function disconnectRecordingAudioSource(key) {
    const source = recordingAudioSources.get(key);
    if (!source) return;

    try {
        source.disconnect();
    } catch (err) {
        console.debug('Recording audio source disconnect skipped:', err);
    }

    recordingAudioSources.delete(key);
}

function resetRecordingAudioGraph() {
    Array.from(recordingAudioSources.keys()).forEach(disconnectRecordingAudioSource);
    recordingMixCompressorNode = null;
    recordingMixGainNode = null;
    audioDestination = null;
}

function createRecordingAudioGraph() {
    if (!audioContext) return;

    audioDestination = audioContext.createMediaStreamDestination();
    recordingMixCompressorNode = audioContext.createDynamicsCompressor();
    recordingMixCompressorNode.threshold.value = -24;
    recordingMixCompressorNode.knee.value = 18;
    recordingMixCompressorNode.ratio.value = 4;
    recordingMixCompressorNode.attack.value = 0.003;
    recordingMixCompressorNode.release.value = 0.2;

    recordingMixGainNode = audioContext.createGain();
    recordingMixGainNode.gain.value = RECORDING_AUDIO_BOOST;

    recordingMixCompressorNode.connect(recordingMixGainNode);
    recordingMixGainNode.connect(audioDestination);
}

function connectRecordingAudioSource(key, stream) {
    disconnectRecordingAudioSource(key);

    if (!audioContext || !recordingMixCompressorNode || !stream?.getAudioTracks?.().length) {
        return;
    }

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(recordingMixCompressorNode);
    recordingAudioSources.set(key, source);
}

function getSafeRecordingDimension(value, fallback) {
    const safeValue = Math.max(2, Math.round(value || fallback));
    return safeValue % 2 === 0 ? safeValue : safeValue + 1;
}

function getFullscreenRecordingSize(videoWidth, videoHeight) {
    const safeWidth = getSafeRecordingDimension(videoWidth, 1920);
    const safeHeight = getSafeRecordingDimension(videoHeight, 1080);
    const longestEdge = Math.max(safeWidth, safeHeight);

    if (longestEdge <= MAX_RECORDING_EDGE) {
        return { width: safeWidth, height: safeHeight };
    }

    const scale = MAX_RECORDING_EDGE / longestEdge;
    return {
        width: getSafeRecordingDimension(safeWidth * scale, 1920),
        height: getSafeRecordingDimension(safeHeight * scale, 1080)
    };
}

function stopRecordingRenderer() {
    if (recordingAnimationFrame) {
        cancelAnimationFrame(recordingAnimationFrame);
        recordingAnimationFrame = null;
    }

    if (recordingSourceVideo) {
        recordingSourceVideo.pause();
        recordingSourceVideo.srcObject = null;
        recordingSourceVideo.remove();
        recordingSourceVideo = null;
    }

    if (recordingCanvasStream) {
        recordingCanvasStream.getVideoTracks().forEach(track => track.stop());
        recordingCanvasStream = null;
    }

    recordingCanvasContext = null;
    recordingCanvas = null;
}

function renderRecordingFrame() {
    if (!recordingCanvas || !recordingCanvasContext || !recordingSourceVideo) return;

    const sourceWidth = recordingSourceVideo.videoWidth || recordingCanvas.width;
    const sourceHeight = recordingSourceVideo.videoHeight || recordingCanvas.height;
    if (!sourceWidth || !sourceHeight) {
        recordingAnimationFrame = requestAnimationFrame(renderRecordingFrame);
        return;
    }

    recordingCanvasContext.clearRect(0, 0, recordingCanvas.width, recordingCanvas.height);
    recordingCanvasContext.drawImage(
        recordingSourceVideo,
        0,
        0,
        sourceWidth,
        sourceHeight,
        0,
        0,
        recordingCanvas.width,
        recordingCanvas.height
    );
    recordingAnimationFrame = requestAnimationFrame(renderRecordingFrame);
}

let recordingCombinedStream = null;

function updateRecordingVideoTrack(newStream) {
    if (!isRecording || !recordingCombinedStream || !newStream) return;

    const newVideoTrack = newStream.getVideoTracks?.()?.[0];
    if (!newVideoTrack) return;

    const currentVideoTracks = recordingCombinedStream.getVideoTracks();
    currentVideoTracks.forEach(track => {
        try {
            recordingCombinedStream.removeTrack(track);
        } catch (e) {
            console.debug('Error removing old recording track:', e);
        }
    });

    const clonedTrack = newVideoTrack.clone();
    recordingCombinedStream.addTrack(clonedTrack);
    console.log('Recording video track dynamically updated to match current stage presentation.');
}

async function createFullscreenRecordingStream(sourceStream, mixedAudioTrack) {
    const sourceTrack = sourceStream?.getVideoTracks?.()[0];
    if (!sourceTrack) {
        throw new Error('No video track available for recording.');
    }

    stopRecordingRenderer();
    recordingCombinedStream = new MediaStream();
    const recorderVideoTrack = sourceTrack.clone();
    recordingCombinedStream.addTrack(recorderVideoTrack);

    if (mixedAudioTrack) {
        recordingCombinedStream.addTrack(mixedAudioTrack);
    }

    return recordingCombinedStream;
}

function sendCurrentMediaState(conn) {
    if (!conn || !conn.open) return;
    conn.send({ type: 'video-toggle', enabled: isLocalVideoEnabled });
}

function broadcastLocalVideoState() {
    peersData.forEach(p => {
        if (p.connection && p.connection.open) {
            p.connection.send({ type: 'video-toggle', enabled: isLocalVideoEnabled });
        }
    });
}

function updateVideoGridLayout() {
    if (!videoAreaGrid) return;

    const count = videoAreaGrid.querySelectorAll('.video-container').length;
    const isPresenting = Boolean(currentSharer);

    videoAreaGrid.classList.remove('single-user', 'multi-user', 'share-mode');
    if (participantsPanel) {
        participantsPanel.classList.toggle('presenting-layout', isPresenting);
    }
    if (focusPanel) {
        focusPanel.classList.toggle('presenting-layout', isPresenting);
    }

    if (isPresenting) {
        videoAreaGrid.classList.add('share-mode');
        if (gridCopy) {
            gridCopy.textContent = isHostLikeRole(currentSharerRole)
                ? 'Presentation stays large. Cameras stay readable below.'
                : 'Presenter on stage. Cameras stay fixed below.';
        }
        return;
    }

    videoAreaGrid.classList.add(count <= 1 ? 'single-user' : 'multi-user');
    if (gridCopy) {
        gridCopy.textContent = count <= 1 ? 'Fixed camera view.' : 'Grid view.';
    }
}

function setPresentationLayout(active, sharerName = '', isLocalSharer = false, sharerRole = null) {
    if (focusPlaceholder) {
        focusPlaceholder.classList.toggle('hidden', active);
    }

    if (focusPanel) {
        focusPanel.classList.toggle('hidden', !active);
    }

    if (active) {
        currentSharerRole = sharerRole || currentSharerRole || (isLocalSharer ? getLocalRoleKey() : 'participant');
        const stageLabel = isLocalSharer ? 'You are presenting' : `${sharerName} is presenting`;
        if (stageTitle) {
            stageTitle.textContent = stageLabel;
        }
        if (stageCopy) {
            stageCopy.textContent = isLocalSharer
                ? 'The screen-share approval came from this device. Other users should only receive your presentation feed.'
                : `${sharerName}'s device granted the screen-share permission. Viewers should see the stage without receiving a local share prompt.`;
        }
        if (presenterChip) {
            presenterChip.innerHTML = `<i class="fa-solid fa-display text-brand-400"></i> ${stageLabel}`;
        }
        syncPresentationViewportMode(true, currentSharerRole);
        updateVideoGridLayout();
        requestAnimationFrame(updateStageViewportSizing);
        return;
    }

    if (isManualStageFullscreen) {
        exitManualStageFullscreen();
    }

    currentSharerRole = null;
    syncPresentationViewportMode(false);

    if (focusVideo) {
        focusVideo.srcObject = null;
    }
    resetStageViewportSizing();
    if (focusName) {
        focusName.innerText = 'Presentation Stage';
    }
    if (stageTitle) {
        stageTitle.textContent = 'Ready for the room';
    }
    if (stageCopy) {
        stageCopy.textContent = 'When someone clicks present, that person\'s browser should ask for screen-share approval. Everyone else should only receive the shared view.';
    }
    if (presenterChip) {
        presenterChip.innerHTML = '<i class="fa-solid fa-display text-brand-400"></i> No one is presenting';
    }
    updateVideoGridLayout();
}

async function startLocalVideo() {
    if (localStream) return true; // Already started via preview
    
    try {
        const mediaProfiles = [
            {
                video: {
                    facingMode: 'user',
                    width: { ideal: 1280, max: 1920 },
                    height: { ideal: 720, max: 1080 },
                    frameRate: { ideal: 24, max: 30 }
                },
                audio: { ...MIC_AUDIO_CONSTRAINTS }
            },
            {
                video: {
                    facingMode: 'user',
                    width: { ideal: 640, max: 1280 },
                    height: { ideal: 480, max: 720 },
                    frameRate: { ideal: 20, max: 24 }
                },
                audio: { ...MIC_AUDIO_CONSTRAINTS }
            },
            {
                video: { facingMode: 'user' },
                audio: { ...MIC_AUDIO_CONSTRAINTS }
            },
            {
                video: true,
                audio: { ...MIC_AUDIO_CONSTRAINTS }
            },
            {
                video: true,
                audio: false
            }
        ];

        let lastError = null;
        for (const constraints of mediaProfiles) {
            try {
                localStream = await navigator.mediaDevices.getUserMedia(constraints);
                break;
            } catch (err) {
                lastError = err;
                console.warn('Media profile failed:', constraints, err);
            }
        }

        if (!localStream) {
            throw lastError || new Error('Could not access camera stream.');
        }

        localVideo.srcObject = localStream;
        if (previewVideo) previewVideo.srcObject = localStream;

        const vTrack = localStream.getVideoTracks()[0];
        if (vTrack) vTrack.enabled = isLocalVideoEnabled;
        const aTrack = localStream.getAudioTracks()[0];
        if (aTrack) aTrack.enabled = isLocalAudioEnabled;

        setParticipantVideoState('local', isLocalVideoEnabled, 'You');
        updatePrejoinUI();
        updateMediaButtonStates();
        return true;
    } catch (err) {
        console.error("Error accessing media devices.", err);
        if (err.name === 'NotAllowedError' || err.name === 'NotFoundError') {
            permissionModal.classList.remove('hidden-section');
        } else {
            alert("Could not access camera and microphone.");
        }
        return false;
    }
}

function getActiveStream() {
    if (isScreenSharing && screenStream) {
        // Return a combined stream: Screen Video + Local Audio
        const tracks = [screenStream.getVideoTracks()[0]];
        if (localStream && localStream.getAudioTracks().length > 0) {
            tracks.push(localStream.getAudioTracks()[0]);
        }
        return new MediaStream(tracks);
    }
    return localStream;
}

// === Pre-Join & Media Preferences Handling ===
function updateMediaButtonStates() {
    if (btnToggleAudio) {
        btnToggleAudio.innerHTML = isLocalAudioEnabled ? '<i class="fa-solid fa-microphone text-base"></i>' : '<i class="fa-solid fa-microphone-slash text-base"></i>';
        btnToggleAudio.classList.toggle('bg-slate-800', isLocalAudioEnabled);
        btnToggleAudio.classList.toggle('bg-red-600', !isLocalAudioEnabled);
    }
    if (btnToggleVideo) {
        btnToggleVideo.innerHTML = isLocalVideoEnabled ? '<i class="fa-solid fa-video text-base"></i>' : '<i class="fa-solid fa-video-slash text-base"></i>';
        btnToggleVideo.classList.toggle('bg-slate-800', isLocalVideoEnabled);
        btnToggleVideo.classList.toggle('bg-red-600', !isLocalVideoEnabled);
    }
}

function updatePrejoinUI() {
    // 1. Join Card Buttons
    if (btnPrejoinCam && txtPrejoinCam && iconPrejoinCam) {
        if (isLocalVideoEnabled) {
            btnPrejoinCam.className = 'flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs font-bold transition hover:bg-emerald-500/20 active:scale-95';
            iconPrejoinCam.className = 'fa-solid fa-video text-sm';
            txtPrejoinCam.textContent = 'Cam: ON';
        } else {
            btnPrejoinCam.className = 'flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs font-bold transition hover:bg-rose-500/20 active:scale-95';
            iconPrejoinCam.className = 'fa-solid fa-video-slash text-sm text-rose-400';
            txtPrejoinCam.textContent = 'Cam: OFF';
        }
    }

    if (btnPrejoinMic && txtPrejoinMic && iconPrejoinMic) {
        if (isLocalAudioEnabled) {
            btnPrejoinMic.className = 'flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs font-bold transition hover:bg-emerald-500/20 active:scale-95';
            iconPrejoinMic.className = 'fa-solid fa-microphone text-sm';
            txtPrejoinMic.textContent = 'Mic: ON';
        } else {
            btnPrejoinMic.className = 'flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs font-bold transition hover:bg-rose-500/20 active:scale-95';
            iconPrejoinMic.className = 'fa-solid fa-microphone-slash text-sm text-rose-400';
            txtPrejoinMic.textContent = 'Mic: OFF';
        }
    }

    // 2. Pre-Join Modal Cards
    if (modalCardCam && modalPillCam && modalSubCam && modalIconCam && modalIconCamBox) {
        if (isLocalVideoEnabled) {
            modalCardCam.className = 'cursor-pointer select-none rounded-2xl border p-4 transition-all duration-200 flex flex-col justify-between h-28 border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/15';
            modalIconCamBox.className = 'flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400';
            modalIconCam.className = 'fa-solid fa-video text-sm';
            modalPillCam.className = 'rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-300 uppercase';
            modalPillCam.textContent = 'চালু (ON)';
            modalSubCam.className = 'text-[10px] text-emerald-400 font-semibold';
            modalSubCam.textContent = 'ভিডিও চালু থাকবে';
        } else {
            modalCardCam.className = 'cursor-pointer select-none rounded-2xl border p-4 transition-all duration-200 flex flex-col justify-between h-28 border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/15';
            modalIconCamBox.className = 'flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400';
            modalIconCam.className = 'fa-solid fa-video-slash text-sm';
            modalPillCam.className = 'rounded-full bg-rose-500/20 border border-rose-500/30 px-2 py-0.5 text-[10px] font-bold text-rose-300 uppercase';
            modalPillCam.textContent = 'বন্ধ (OFF)';
            modalSubCam.className = 'text-[10px] text-rose-400 font-semibold';
            modalSubCam.textContent = 'ক্যামেরা বন্ধ থাকবে';
        }
    }

    if (modalCardMic && modalPillMic && modalSubMic && modalIconMic && modalIconMicBox) {
        if (isLocalAudioEnabled) {
            modalCardMic.className = 'cursor-pointer select-none rounded-2xl border p-4 transition-all duration-200 flex flex-col justify-between h-28 border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/15';
            modalIconMicBox.className = 'flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400';
            modalIconMic.className = 'fa-solid fa-microphone text-sm';
            modalPillMic.className = 'rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-300 uppercase';
            modalPillMic.textContent = 'চালু (ON)';
            modalSubMic.className = 'text-[10px] text-emerald-400 font-semibold';
            modalSubMic.textContent = 'কথা বলা যাবে';
        } else {
            modalCardMic.className = 'cursor-pointer select-none rounded-2xl border p-4 transition-all duration-200 flex flex-col justify-between h-28 border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/15';
            modalIconMicBox.className = 'flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400';
            modalIconMic.className = 'fa-solid fa-microphone-slash text-sm';
            modalPillMic.className = 'rounded-full bg-rose-500/20 border border-rose-500/30 px-2 py-0.5 text-[10px] font-bold text-rose-300 uppercase';
            modalPillMic.textContent = 'বন্ধ (OFF)';
            modalSubMic.className = 'text-[10px] text-rose-400 font-semibold';
            modalSubMic.textContent = 'মাইক্রোফোন মিউট থাকবে';
        }
    }

    // 3. Preview Section Buttons
    if (btnPreviewAudio) {
        btnPreviewAudio.innerHTML = isLocalAudioEnabled ? '<i class="fa-solid fa-microphone"></i>' : '<i class="fa-solid fa-microphone-slash"></i>';
        btnPreviewAudio.classList.toggle('bg-slate-800', isLocalAudioEnabled);
        btnPreviewAudio.classList.toggle('bg-red-600', !isLocalAudioEnabled);
    }

    if (btnPreviewVideo) {
        btnPreviewVideo.innerHTML = isLocalVideoEnabled ? '<i class="fa-solid fa-video"></i>' : '<i class="fa-solid fa-video-slash"></i>';
        btnPreviewVideo.classList.toggle('bg-slate-800', isLocalVideoEnabled);
        btnPreviewVideo.classList.toggle('bg-red-600', !isLocalVideoEnabled);
    }
}

function togglePrejoinCam() {
    isLocalVideoEnabled = !isLocalVideoEnabled;
    updatePrejoinUI();
    if (localStream) {
        const vTrack = localStream.getVideoTracks()[0];
        if (vTrack) vTrack.enabled = isLocalVideoEnabled;
        if (previewVideo) previewVideo.style.opacity = isLocalVideoEnabled ? '1' : '0.3';
    }
}

function togglePrejoinMic() {
    isLocalAudioEnabled = !isLocalAudioEnabled;
    updatePrejoinUI();
    if (localStream) {
        const aTrack = localStream.getAudioTracks()[0];
        if (aTrack) aTrack.enabled = isLocalAudioEnabled;
    }
}

// === Event Listeners ===
function setupEventListeners() {
    btnShowAdminLogin.addEventListener('click', () => screens.adminLogin.classList.remove('hidden-section'));
    btnCancelAdmin.addEventListener('click', () => {
        screens.adminLogin.classList.add('hidden-section');
        loginError.classList.add('hidden');
    });
    btnAdminLogin.addEventListener('click', handleAdminLogin);
    btnRequestJoin.addEventListener('click', handleUserJoinRequest);
    btnToggleAudio.addEventListener('click', toggleAudio);
    btnToggleVideo.addEventListener('click', toggleVideo);
    btnLeave.addEventListener('click', leaveMeeting);
    
    // Pre-join & Preview buttons
    if (btnPrejoinCam) btnPrejoinCam.addEventListener('click', togglePrejoinCam);
    if (btnPrejoinMic) btnPrejoinMic.addEventListener('click', togglePrejoinMic);
    if (btnPreviewAudio) btnPreviewAudio.addEventListener('click', togglePrejoinMic);
    if (btnPreviewVideo) btnPreviewVideo.addEventListener('click', togglePrejoinCam);

    // Pre-join Modal interactions
    if (modalCardCam) modalCardCam.addEventListener('click', togglePrejoinCam);
    if (modalCardMic) modalCardMic.addEventListener('click', togglePrejoinMic);
    if (btnPrejoinModalConfirm) {
        btnPrejoinModalConfirm.addEventListener('click', () => {
            if (prejoinOptionsModal) prejoinOptionsModal.classList.add('hidden-section');
            if (isLocalVideoEnabled) {
                startLocalVideo();
            }
        });
    }
    
    // Continuous audio unlock on any document interaction
    document.addEventListener('click', unlockRemoteAudioPlayback, { passive: true });
    document.addEventListener('touchstart', unlockRemoteAudioPlayback, { passive: true });
    document.addEventListener('fullscreenchange', handleBrowserFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleBrowserFullscreenChange);
    window.addEventListener('pagehide', () => {
        if (isAdmin && !meetingClosed) {
            broadcastMeetingEnded('Meeting ended by host.');
        }
    });

    if (btnStageFullscreenEnter) {
        btnStageFullscreenEnter.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            enterManualStageFullscreen();
        });
    }

    if (btnStageFullscreenExit) {
        btnStageFullscreenExit.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            exitManualStageFullscreen();
        });
    }

    if (focusContainer) {
        const revealStageControls = () => {
            if (isManualStageFullscreen) {
                showStageFullscreenControlsTemporarily();
            }
        };
        focusContainer.addEventListener('click', revealStageControls);
        focusContainer.addEventListener('touchstart', revealStageControls, { passive: true });
    }

    if (meetingFooter) {
        meetingFooter.addEventListener('click', () => {
            if (isManualStageFullscreen) {
                showStageFullscreenControlsTemporarily();
            }
        });
    }
    
    if (btnClosePermission) {
        btnClosePermission.addEventListener('click', () => {
            permissionModal.classList.add('hidden-section');
        });
    }

    btnCopyLink.addEventListener('click', async () => {
        const inviteLink = inputInviteLink.value.trim();
        if (!inviteLink) {
            alert('Invite link is not ready yet. Wait a moment and try again.');
            return;
        }

        try {
            await copyTextToClipboard(inviteLink);
            btnCopyLink.innerHTML = '<i class="fa-solid fa-check text-emerald-400"></i><span class="hidden lg:inline">Copied</span>';
        } catch (err) {
            console.error('Copy failed:', err);
            alert('Could not copy the invite link automatically. Please copy it manually.');
        }

        setTimeout(() => {
            btnCopyLink.innerHTML = '<i class="fa-regular fa-copy"></i><span class="hidden lg:inline">Copy</span>';
        }, 2000);
    });

    btnRecord.addEventListener('click', toggleRecording);
    btnScreenShare.addEventListener('click', toggleScreenShare);
    btnRaiseHand.addEventListener('click', toggleRaiseHand);

    // Mobile Sidebar Toggles
    if (btnToggleSidebar) {
        btnToggleSidebar.addEventListener('click', () => {
            adminSidebar.classList.remove('hidden', 'translate-x-full');
            adminSidebar.classList.add('flex');
            adminSidebar.classList.remove('translate-x-full');
            sidebarBackdrop.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
            sidebarBackdrop.classList.add('opacity-100', 'pointer-events-auto');
        });
    }
    if (btnCloseSidebar) {
        btnCloseSidebar.addEventListener('click', closeMobileSidebar);
    }
    if (sidebarBackdrop) {
        sidebarBackdrop.addEventListener('click', closeMobileSidebar);
    }

    const btnConnectDrive = document.getElementById('btn-connect-drive');
    if (btnConnectDrive) {
        btnConnectDrive.addEventListener('click', async () => {
            try {
                await requestGoogleDriveToken();
                alert('Google Drive connected successfully! Recorded meeting videos will now upload directly to your Google Drive.');
            } catch (err) {
                console.error('Drive authorization error:', err);
                alert('Google Drive connection failed or was cancelled: ' + (err.message || 'Permission denied'));
            }
        });
    }
}

function closeMobileSidebar() {
    if (isDesktopViewport()) return;

    adminSidebar.classList.add('translate-x-full');
    sidebarBackdrop.classList.remove('opacity-100', 'pointer-events-auto');
    sidebarBackdrop.classList.add('opacity-0', 'pointer-events-none');
    setTimeout(() => {
        if (sidebarBackdrop.classList.contains('opacity-0')) {
            sidebarBackdrop.classList.add('hidden');
        }
        if (adminSidebar.classList.contains('translate-x-full')) {
            adminSidebar.classList.add('hidden');
            adminSidebar.classList.remove('flex');
        }
    }, 300);
}

// === Admin Functions ===
async function handleAdminLogin() {
    const id = inputAdminId.value;
    const pass = inputAdminPass.value;

    if (id === 'admin' && pass === '123456') {
        isAdmin = true;
        myName = "Host";
        setMeetingRoleUI();
        updateDriveStatusUI(Boolean(driveAccessToken));
        screens.adminLogin.classList.add('hidden-section');
        
        const mediaSuccess = await startLocalVideo();
        if(!mediaSuccess) return;

        showScreen('meeting');
        adminControlsHeader.classList.remove('hidden');
        adminControlsHeader.classList.add('flex');
        if (btnToggleSidebar) btnToggleSidebar.classList.remove('hidden');
        btnRecord.classList.remove('hidden');
        btnRecord.classList.add('flex');
        setRecordButtonState(false);
        syncSidebarForViewport();

        await initializePeer();
    } else {
        loginError.classList.remove('hidden');
    }
}

// === User Functions ===
async function handleUserJoinRequest() {
    myName = inputJoinName.value.trim();
    if (!myName) return joinError.classList.remove('hidden');
    if (!adminPeerId) {
        joinError.innerText = "No meeting ID found in link.";
        return joinError.classList.remove('hidden');
    }

    const mediaSuccess = await startLocalVideo();
    if(!mediaSuccess) return;

    if (localStream) {
        const vTrack = localStream.getVideoTracks()[0];
        if (vTrack) vTrack.enabled = isLocalVideoEnabled;
        const aTrack = localStream.getAudioTracks()[0];
        if (aTrack) aTrack.enabled = isLocalAudioEnabled;
    }
    setParticipantVideoState('local', isLocalVideoEnabled, 'You');
    updateMediaButtonStates();

    showScreen('waiting');
    await initializePeer();
}

// === Peer Initialization (Mesh) ===
const twilioAccountSid = 'AC09ee27b48b02b73be35c8f97bb92af04';
const twilioAuthToken = 'e521bb75c3c60565048b47b96fe884fb';

async function getTwilioIceServers() {
    try {
        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Tokens.json`, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + btoa(twilioAccountSid + ':' + twilioAuthToken)
            }
        });
        const data = await response.json();
        return data.ice_servers;
    } catch (err) {
        console.error("Twilio error:", err);
        return [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
        ];
    }
}

async function initializePeer() {
    const iceServers = await getTwilioIceServers();
    
    const peerConfig = {
        config: {
            'iceServers': iceServers
        }
    };

    const peerId = isAdmin ? ('meet-' + Math.random().toString(36).substr(2, 9)) : undefined;
    peer = new Peer(peerId, peerConfig);

    peer.on('open', (id) => {
        console.log('My Peer ID:', id);
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        
        if (isAdmin) {
            adminPeerId = id;
            inputInviteLink.value = buildInviteLink(id);
        } else {
            // User joins Admin
            const conn = peer.connect(adminPeerId, {metadata: {
                name: myName,
                role: getLocalRoleKey(),
                isVideoEnabled: isLocalVideoEnabled,
                isAudioEnabled: isLocalAudioEnabled
            }});
            peersData.set(adminPeerId, {name: "Host", connection: conn, role: 'host'});
            
            conn.on('open', () => conn.send({
                type: 'request-join',
                name: myName,
                isVideoEnabled: isLocalVideoEnabled,
                isAudioEnabled: isLocalAudioEnabled
            }));
            setupConnectionListeners(conn);
        }
    });

    peer.on('connection', (conn) => {
        // Handle incoming data connections
        const remoteName = conn.metadata ? conn.metadata.name : "User";
        const remoteRole = conn.metadata ? conn.metadata.role : 'participant';
        
        if (isAdmin && !peersData.has(conn.peer)) {
            // New join request
            pendingRequests.set(conn.peer, {
                name: remoteName,
                conn,
                isVideoEnabled: conn.metadata?.isVideoEnabled !== false,
                isAudioEnabled: conn.metadata?.isAudioEnabled !== false
            });
            updateRequestsUI();
            
            // If they close the tab while waiting
            conn.on('close', () => {
                pendingRequests.delete(conn.peer);
                updateRequestsUI();
            });
        } else {
            // Full Mesh: peer connecting directly
            if (!peersData.has(conn.peer)) {
                peersData.set(conn.peer, {name: remoteName, connection: conn, role: remoteRole || 'participant'});
            } else {
                peersData.get(conn.peer).connection = conn;
                if (remoteRole) peersData.get(conn.peer).role = remoteRole;
            }
            setupConnectionListeners(conn);
        }
    });

    peer.on('error', (err) => {
        console.error("PeerJS Error:", err);
        if (err.type === 'peer-unavailable') {
            alert("মিটিংটি শেষ হয়ে গেছে অথবা অ্যাডমিন এই মুহূর্তে অফলাইনে আছেন। (Admin is offline)");
            window.location.reload();
        } else if (err.type === 'network' || err.type === 'disconnected') {
            console.warn("Network issue detected.");
            schedulePeerReconnect();
        }
    });

    peer.on('disconnected', () => {
        console.warn('Peer disconnected from signaling server.');
        schedulePeerReconnect();
    });

    peer.on('call', (call) => {
        // --- BULLETPROOF APPROVAL FALLBACK ---
        // If the data channel dropped the 'approved' message, the media call metadata will still deliver it!
        if (call.metadata && call.metadata.type === 'approved' && !isAdmin) {
            handleApproved(call.metadata.peers, call.metadata.presentation);
        }

        // Handle incoming media calls using the current active stream (camera or screen share)
        call.answer(getActiveStream());

        const remoteName = call.metadata ? call.metadata.name : "User";
        
        if (!peersData.has(call.peer)) {
            peersData.set(call.peer, {name: remoteName, role: call.metadata?.role || 'participant'});
        } else if (call.metadata?.role) {
            peersData.get(call.peer).role = call.metadata.role;
        }
        setupCallListeners(call, remoteName, { initiatedLocally: false });
    });
}

function setupConnectionListeners(conn) {
    const syncConnectionState = () => {
        markConnectionAlive(conn);
        sendCurrentMediaState(conn);
        sendCurrentPresentationState(conn);
        startConnectionHeartbeat(conn);
    };

    conn.on('open', syncConnectionState);
    if (conn.open) syncConnectionState();

    conn.on('data', data => {
        markConnectionAlive(conn);

        if (data.type === 'request-join' && isAdmin) {
            if (!peersData.has(conn.peer)) {
                pendingRequests.set(conn.peer, {
                    name: data.name,
                    conn,
                    isVideoEnabled: data.isVideoEnabled !== false,
                    isAudioEnabled: data.isAudioEnabled !== false
                });
                updateRequestsUI();
            }
        } else if (data.type === 'heartbeat') {
            return;
        } else if (data.type === 'approved' && !isAdmin) {
            handleApproved(data.peers, data.presentation);
        } else if (data.type === 'rejected' && !isAdmin) {
            alert("Your request to join was rejected by the admin.");
            window.location.reload();
        } else if (data.type === 'new-peer') {
            // Just register their info, wait for them to connect
            if (!peersData.has(data.id)) {
                peersData.set(data.id, {name: data.name, role: data.role || 'participant'});
            } else if (data.role) {
                peersData.get(data.id).role = data.role;
            }
        } else if (data.type === 'presentation-state') {
            applyPresentationState(data.presentation);
        } else if (data.type === 'screen-share-start') {
            handleScreenShareStart(conn.peer, data.role);
        } else if (data.type === 'screen-share-stop') {
            handleScreenShareStop(conn.peer);
        } else if (data.type === 'meeting-ended') {
            endMeetingSession(data.reason || 'Meeting ended by host.');
        } else if (data.type === 'peer-role-update') {
            updatePeerRole(data.peerId, data.role);
        } else if (data.type === 'video-toggle') {
            conn.currentVideoEnabled = data.enabled;
            const participant = peersData.get(conn.peer);
            if (participant) {
                participant.isVideoEnabled = data.enabled;
            } else if (pendingRequests.has(conn.peer)) {
                pendingRequests.get(conn.peer).isVideoEnabled = data.enabled;
            }
            setParticipantVideoState(conn.peer, data.enabled, participant?.name || 'User');
        } else if (data.type === 'force-toggle-mute') {
            toggleAudio();
        } else if (data.type === 'kick') {
            alert("আপনাকে মিটিং থেকে বের করে দেওয়া হয়েছে। (You have been kicked by the host)");
            window.location.reload();
        } else if (data.type === 'hand-toggle') {
            toggleHandIcon(conn.peer, data.isRaised);
        } else if (data.type === 'make-cohost') {
            isCoHost = true;
            alert("You are now a Co-Host!");
            btnRecord.classList.remove('hidden'); // Co-Hosts can also record (via main host)
            btnRecord.classList.add('flex');
            setMeetingRoleUI();
            setRecordButtonState(isRecording);
            if (currentSharer === 'local' && isScreenSharing) {
                currentSharerRole = getLocalRoleKey();
                syncPresentationViewportMode(true, currentSharerRole);
            }
            // Re-render admin controls for existing videos
            document.querySelectorAll('#video-grid .video-container').forEach(container => {
                const vidId = container.id.replace('video-container-', '');
                if (vidId !== 'local' && vidId !== adminPeerId) {
                    addAdminControlsToContainer(container, vidId);
                }
            });
        } else if (data.type === 'request-record-toggle') {
            if (isAdmin && !isCoHost) toggleRecording();
        } else if (data.type === 'recording-state') {
            setRecordingUI(data.state);
        }
    });

    conn.on('close', () => {
        stopConnectionHeartbeat(conn.peer);
        removeUser(conn.peer);
    });
}

function setupCallListeners(call, name, options = {}) {
    let pData = peersData.get(call.peer);
    if (!pData) {
        pData = {name: name, role: call.metadata?.role || 'participant'};
        peersData.set(call.peer, pData);
    } else if (call.metadata?.role) {
        pData.role = call.metadata.role;
    }

    if (options.initiatedLocally) {
        pData.shouldInitiateCalls = true;
    } else if (typeof pData.shouldInitiateCalls === 'undefined') {
        pData.shouldInitiateCalls = false;
    }

    pData.call = call;

    const peerConnection = call.peerConnection;
    const handleTransportStateChange = () => {
        const connectionState = peerConnection?.connectionState;
        const iceState = peerConnection?.iceConnectionState;
        if (['failed', 'disconnected'].includes(connectionState) || ['failed', 'disconnected'].includes(iceState)) {
            scheduleMediaReconnect(call.peer);
        }
    };

    if (peerConnection) {
        peerConnection.addEventListener('connectionstatechange', handleTransportStateChange);
        peerConnection.addEventListener('iceconnectionstatechange', handleTransportStateChange);
    }

    call.on('stream', stream => {
        // Removed stream.id check: PeerJS sometimes fires stream event multiple times (e.g. video then audio).
        // By passing it to addVideoStream, we ensure the latest stream with all tracks is attached.
        pData.stream = stream;
        stopMediaReconnect(call.peer);
        addVideoStream(call.peer, stream, name);
        
        // If recording is active, plug this new stream into the mix
        if (isRecording && audioContext && recordingMixCompressorNode) {
            connectRecordingAudioSource(`peer:${call.peer}`, stream);
        }
    });
    call.on('error', () => scheduleMediaReconnect(call.peer));
    call.on('close', () => {
        if (peerConnection) {
            peerConnection.removeEventListener('connectionstatechange', handleTransportStateChange);
            peerConnection.removeEventListener('iceconnectionstatechange', handleTransportStateChange);
        }
        removeUser(call.peer);
    });
}

// === Admin Approval Flow ===
function updateRequestsUI() {
    requestsList.innerHTML = '';
    requestCount.innerText = pendingRequests.size;
    noRequests.classList.toggle('hidden', pendingRequests.size > 0);
    
    // Update mobile badge
    if (mobileRequestBadge) {
        mobileRequestBadge.innerText = pendingRequests.size;
        if (pendingRequests.size > 0) {
            mobileRequestBadge.classList.remove('hidden');
            mobileRequestBadge.classList.add('flex');
            if (btnToggleSidebar) btnToggleSidebar.classList.add('animate-bounce');
            setTimeout(() => { if(btnToggleSidebar) btnToggleSidebar.classList.remove('animate-bounce'); }, 3000);
        } else {
            mobileRequestBadge.classList.add('hidden');
            mobileRequestBadge.classList.remove('flex');
        }
    }

    pendingRequests.forEach((req, peerId) => {
        const div = document.createElement('div');
        div.className = 'rounded-3xl border border-slate-800 bg-slate-900/70 p-4 flex items-center justify-between gap-3';
        div.innerHTML = `
            <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-white" title="${req.name}">${req.name}</p>
                <p class="text-xs text-slate-500">Waiting for host approval</p>
            </div>
            <div class="flex shrink-0 gap-2">
                <button class="flex h-10 w-10 items-center justify-center rounded-full bg-red-500 text-white transition hover:bg-red-600" onclick="rejectUser('${peerId}')"><i class="fa-solid fa-xmark"></i></button>
                <button class="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white transition hover:bg-emerald-600" onclick="approveUser('${peerId}')"><i class="fa-solid fa-check"></i></button>
            </div>
        `;
        requestsList.appendChild(div);
    });
}

window.approveUser = function(peerId) {
    const req = pendingRequests.get(peerId);
    if (!req) return;

    // Send active peer list to new user
    const currentPeers = [];
    const activePresentation = getCurrentPresentationState();
    peersData.forEach((d, id) => {
        if (d.connection && id !== adminPeerId && id !== peerId) {
            currentPeers.push({id, name: d.name, role: d.role || 'participant'});
        }
    });

    req.conn.send({ type: 'approved', peers: currentPeers, presentation: activePresentation });
    
    // Attach connection listeners now that they are approved
    setupConnectionListeners(req.conn);
    peersData.set(peerId, {
        name: req.name,
        connection: req.conn,
        isVideoEnabled: req.isVideoEnabled !== false,
        role: 'participant'
    });
    
    // Broadcast new user to existing peers
    peersData.forEach((d, id) => {
        if (d.connection && id !== peerId && id !== adminPeerId) {
            d.connection.send({ type: 'new-peer', id: peerId, name: req.name, role: 'participant' });
        }
    });

    pendingRequests.delete(peerId);
    updateRequestsUI();

    // Admin initiates Media Call to the new user directly for highest reliability.
    // We pass the approval info in the metadata as a bulletproof fallback in case the Data Channel drops the message.
    setTimeout(() => {
        const call = peer.call(peerId, getActiveStream(), {
            metadata: createCallMetadata({
                type: 'approved',
                peers: currentPeers,
                presentation: activePresentation
            })
        });
        setupCallListeners(call, req.name, { initiatedLocally: true });
    }, 500);
};

window.rejectUser = function(peerId) {
    const req = pendingRequests.get(peerId);
    if (req) {
        req.conn.send({ type: 'rejected' });
        setTimeout(() => req.conn.close(), 500);
        pendingRequests.delete(peerId);
        updateRequestsUI();
    }
};

window.kickUser = function(peerId) {
    if (!isAdmin && !isCoHost) return;
    const pData = peersData.get(peerId);
    if (pData && pData.connection) {
        pData.connection.send({ type: 'kick' });
        setTimeout(() => {
            if (pData.call) pData.call.close();
            if (pData.connection) pData.connection.close();
            removeUser(peerId);
        }, 500);
    }
};

function updateActiveCount() {
    const activeUsersBadge = document.getElementById('active-users-badge');
    const activeCountEl = document.getElementById('active-count');
    const count = document.querySelectorAll('#video-grid .video-container').length;

    if (activeUsersBadge && activeCountEl) {
        activeUsersBadge.classList.remove('hidden');
        activeCountEl.innerText = count;
    }

    updateVideoGridLayout();
}

// === User Approved Flow ===
let isApproved = false;

function handleApproved(roomPeers, presentation = null) {
    if (isApproved) return;
    isApproved = true;
    
    showScreen('meeting');
    setMeetingRoleUI();
    setPresentationLayout(false);
    
    // Admin will call us, so we just wait for Admin's call.
    // However, we need to call other existing peers in the room.
    roomPeers.forEach(p => {
        // Connect Data
        const conn = peer.connect(p.id, {metadata: {name: myName, role: getLocalRoleKey()}});
        let pData = peersData.get(p.id);
        if (!pData) {
            pData = {name: p.name, role: p.role || 'participant'};
            peersData.set(p.id, pData);
        }
        pData.connection = conn;
        setupConnectionListeners(conn);
        
        // Connect Media
        setTimeout(() => {
            const call = peer.call(p.id, getActiveStream(), {metadata: createCallMetadata()});
            setupCallListeners(call, p.name, { initiatedLocally: true });
        }, 500);
    });

    if (presentation) {
        applyPresentationState(presentation);
    }
}

// === Shared Video & Controls Functions ===
function addVideoStream(id, stream, name) {
    let container = document.getElementById(`video-container-${id}`);
    
    if (container) {
        // If container exists but stream changed (e.g. they reconnected quickly or audio track was added)
        if (id !== 'local') {
            attachRemoteAudio(id, stream);
        }
        const video = container.querySelector('video');
        if (video.srcObject !== stream) {
            video.srcObject = stream;
            syncRemoteVideoPlayback(video, container);
        }
        if (currentSharer === id && focusVideo.srcObject !== stream) {
            focusVideo.srcObject = stream;
            focusVideo.play().catch(e => console.error("Focus video play failed after updating stream:", e));
        }
        return;
    }

    container = document.createElement('div');
    container.id = `video-container-${id}`;
    container.className = 'video-container shadow-lg';

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    if (id === 'local') {
        video.muted = true;
        video.defaultMuted = true;
    } else {
        video.muted = false;
        video.defaultMuted = false;
        video.volume = 1.0;
    }
    video.srcObject = stream;
    
    // Explicitly sync playback immediately AND on metadata loaded
    syncRemoteVideoPlayback(video, container);
    video.onloadedmetadata = () => {
        syncRemoteVideoPlayback(video, container);
    };

    if (id !== 'local') {
        attachRemoteAudio(id, stream);
    }

    const label = document.createElement('div');
    label.className = 'name-label';
    label.innerText = name;

    if ((isAdmin || isCoHost) && id !== adminPeerId) {
        addAdminControlsToContainer(container, id);
    }

    container.appendChild(video);
    container.appendChild(label);
    ensureParticipantDecorations(container, name);
    videoAreaGrid.appendChild(container);

    const isVideoEnabled = id === 'local'
        ? isLocalVideoEnabled
        : peersData.get(id)?.isVideoEnabled !== false;
    setParticipantVideoState(id, isVideoEnabled, name);

    updateActiveCount();
}

function addAdminControlsToContainer(container, id) {
    if (container.querySelector('.admin-controls-overlay')) return;

    const controls = document.createElement('div');
    controls.className = 'admin-controls-overlay absolute top-2 right-2 flex gap-2 z-20 opacity-0 transition-opacity duration-300 group-hover:opacity-100';
    
    const muteBtn = document.createElement('button');
    muteBtn.className = 'bg-gray-700 hover:bg-gray-600 w-8 h-8 rounded-full text-white shadow focus:outline-none';
    muteBtn.innerHTML = '<i class="fa-solid fa-microphone-slash"></i>';
    muteBtn.title = 'Toggle Mute';
    muteBtn.onclick = () => {
        const pData = peersData.get(id);
        if(pData && pData.connection) {
            pData.connection.send({ type: 'force-toggle-mute' });
            muteBtn.classList.replace('bg-gray-700', 'bg-red-500');
            setTimeout(() => muteBtn.classList.replace('bg-red-500', 'bg-gray-700'), 300);
        }
    };
    
    const kickBtn = document.createElement('button');
    kickBtn.className = 'bg-red-600 hover:bg-red-700 w-8 h-8 rounded-full text-white shadow focus:outline-none';
    kickBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i>';
    kickBtn.title = 'Kick User';
    kickBtn.onclick = () => window.kickUser(id);
    
    controls.appendChild(muteBtn);
    controls.appendChild(kickBtn);

    // Only Main Admin can assign Co-Hosts
    if (isAdmin && !isCoHost) {
        const hostBtn = document.createElement('button');
        hostBtn.className = 'bg-blue-600 hover:bg-blue-700 w-8 h-8 rounded-full text-white shadow focus:outline-none';
        hostBtn.innerHTML = '<i class="fa-solid fa-star"></i>';
        hostBtn.title = 'Make Co-Host';
        hostBtn.onclick = () => {
            const pData = peersData.get(id);
            if(pData && pData.connection) {
                pData.connection.send({ type: 'make-cohost' });
                pData.role = 'cohost';
                broadcastPeerRoleUpdate(id, 'cohost');
                alert(pData.name + " is now a Co-Host!");
                hostBtn.remove();
            }
        };
        controls.appendChild(hostBtn);
    }
    
    container.appendChild(controls);
    container.classList.add('group'); // Enable group-hover
}

function removeUser(id) {
    stopConnectionHeartbeat(id);
    stopMediaReconnect(id);

    if (currentSharer === id) {
        currentSharer = null;
        currentSharerRole = null;
        setPresentationLayout(false);
    }

    disconnectRecordingAudioSource(`peer:${id}`);

    const el = document.getElementById(`video-container-${id}`);
    if (el) el.remove();
    const remoteAudioEl = document.getElementById(`remote-audio-${id}`);
    if (remoteAudioEl) remoteAudioEl.remove();
    peersData.delete(id);
    
    updateActiveCount();
    
    if (id === adminPeerId && !isAdmin) {
        endMeetingSession('Meeting ended by host.');
    }
}

function toggleAudio() {
    if(!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) {
        alert('Microphone is not available on this device/browser right now.');
        return;
    }
    isLocalAudioEnabled = !audioTrack.enabled;
    audioTrack.enabled = isLocalAudioEnabled;
    updateMediaButtonStates();
    updatePrejoinUI();
}

function toggleVideo() {
    if(!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (!videoTrack) return;
    isLocalVideoEnabled = !videoTrack.enabled;
    videoTrack.enabled = isLocalVideoEnabled;
    setParticipantVideoState('local', isLocalVideoEnabled, 'You');
    updateMediaButtonStates();
    if (previewVideo) {
        previewVideo.style.opacity = isLocalVideoEnabled ? '1' : '0.3';
    }
    updatePrejoinUI();
    broadcastLocalVideoState();
}

function toggleRaiseHand() {
    isHandRaised = !isHandRaised;
    if (isHandRaised) {
        btnRaiseHand.classList.remove('bg-slate-800', 'text-slate-300');
        btnRaiseHand.classList.add('bg-amber-500', 'text-white');
    } else {
        btnRaiseHand.classList.remove('bg-amber-500', 'text-white');
        btnRaiseHand.classList.add('bg-slate-800', 'text-slate-300');
    }
    
    toggleHandIcon('local', isHandRaised);
    
    peersData.forEach(p => {
        if (p.connection) p.connection.send({ type: 'hand-toggle', isRaised: isHandRaised });
    });
}

function toggleHandIcon(peerId, isRaised) {
    const container = document.getElementById(`video-container-${peerId}`);
    if (!container) return;
    
    let handIcon = container.querySelector('.hand-icon');
    if (isRaised) {
        if (!handIcon) {
            handIcon = document.createElement('div');
            handIcon.className = 'hand-icon absolute top-2 left-2 bg-yellow-500 text-white w-8 h-8 flex items-center justify-center rounded-full shadow-lg z-20 animate-bounce';
            handIcon.innerHTML = '<i class="fa-solid fa-hand"></i>';
            container.appendChild(handIcon);
        }
    } else {
        if (handIcon) handIcon.remove();
    }
}

// === Screen Share Flow & Layout ===
async function toggleScreenShare() {
    if (isScreenSharing) {
        stopScreenShare();
    } else {
        try {
            // Request high-quality full screen video for screen sharing
            const displayConstraints = {
                video: {
                    width: { ideal: 1920, max: 1920 },
                    height: { ideal: 1080, max: 1080 },
                    frameRate: { ideal: 30, max: 30 }
                },
                audio: false
            };
            screenStream = await navigator.mediaDevices.getDisplayMedia(displayConstraints);
            const screenTrack = screenStream.getVideoTracks()[0];
            
            // Replace track for all active calls
            peersData.forEach(p => {
                if (p.call) {
                    const sender = p.call.peerConnection.getSenders().find(s => s.track.kind === 'video');
                    if (sender) sender.replaceTrack(screenTrack);
                }
            });

            isScreenSharing = true;
            currentSharer = 'local';
            currentSharerRole = getLocalRoleKey();
            setScreenShareButtonState(true);

            // Broadcast
            peersData.forEach(p => {
                if (p.connection) {
                    p.connection.send({
                        type: 'screen-share-start',
                        role: currentSharerRole
                    });
                }
            });

            // Local layout update
            focusVideo.srcObject = screenStream;
            focusName.innerText = "You (Screen)";
            setPresentationLayout(true, myName || 'You', true, currentSharerRole);

            if (isRecording) {
                updateRecordingVideoTrack(screenStream);
            }

            screenTrack.onended = () => { if (isScreenSharing) stopScreenShare(); };
        } catch (err) {
            console.error("Error sharing screen:", err);
            
            // Handle mobile/unsupported browser errors gracefully
            if (err.name === "NotSupportedError" || err.message.includes("supported") || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
                alert("দুঃখিত, মোবাইল ব্রাউজার থেকে সরাসরি স্ক্রিন শেয়ার করা সম্ভব নয়। স্ক্রিন শেয়ারিং শুধুমাত্র কম্পিউটার বা ল্যাপটপ থেকে কাজ করে।");
            } else {
                alert("Could not start screen sharing. Permission denied or not supported.");
            }
        }
    }
}

function stopScreenShare() {
    if (!screenStream) return;
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
    isScreenSharing = false;
    if (currentSharer === 'local') {
        currentSharer = null;
        currentSharerRole = null;
    }
    setScreenShareButtonState(false);

    // Revert track for all calls
    const cameraTrack = localStream.getVideoTracks()[0];
    peersData.forEach(p => {
        if (p.call) {
            const sender = p.call.peerConnection.getSenders().find(s => s.track.kind === 'video');
            if (sender) sender.replaceTrack(cameraTrack);
        }
        if (p.connection) p.connection.send({type: 'screen-share-stop'});
    });

    setPresentationLayout(false);

    if (isRecording) {
        updateRecordingVideoTrack(localStream);
    }
}

function handleScreenShareStart(peerId, sharerRole = 'participant') {
    const peerData = peersData.get(peerId);
    currentSharer = peerId;
    currentSharerRole = sharerRole || peerData?.role || 'participant';
    const sharerName = peerData?.name || 'Presenter';

    setPresentationLayout(true, sharerName, false, currentSharerRole);

    if (focusName) {
        focusName.innerText = `${sharerName} (Screen)`;
    }

    if (peerData?.stream) {
        focusVideo.srcObject = peerData.stream;
        focusVideo.play().catch(err => console.error('Focus video play failed:', err));
        requestAnimationFrame(updateStageViewportSizing);

        if (isRecording) {
            updateRecordingVideoTrack(peerData.stream);
        }
    }
}

function handleScreenShareStop(peerId) {
    // Only close focus if the person stopping is the one currently in focus
    if (currentSharer !== peerId) return;
    
    currentSharer = null;
    currentSharerRole = null;
    setPresentationLayout(false);

    if (isRecording) {
        updateRecordingVideoTrack(localStream);
    }
}

function leaveMeeting() {
    meetingClosed = true;

    if (isManualStageFullscreen) {
        applyManualStageFullscreenState(false);
    }

    if (isAdmin) {
        broadcastMeetingEnded('Meeting ended by host.');
    }

    syncPresentationViewportMode(false);
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (peer) peer.destroy();
    window.location.reload();
}

// === Recording Functionality (With Audio Mixing) ===
async function toggleRecording() {
    if (isCoHost) {
        // Co-Host requests Main Host to record, to ensure the file saves on Main Host's device
        const pData = peersData.get(adminPeerId);
        if (pData && pData.connection) {
            pData.connection.send({ type: 'request-record-toggle' });
            btnRecord.classList.add('ring-2', 'ring-brand-400');
            setTimeout(() => btnRecord.classList.remove('ring-2', 'ring-brand-400'), 500);
        }
        return;
    }

    if (!isAdmin) return;

    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

let reusedScreenShare = false;
let recordingVideoStream = null;

async function startRecording() {
    try {
        if (currentSharer === 'local' && screenStream) {
            recordingVideoStream = screenStream;
            reusedScreenShare = true;
        } else if (currentSharer && focusVideo && focusVideo.srcObject) {
            recordingVideoStream = focusVideo.srcObject;
            reusedScreenShare = true;
        } else if (currentSharer && peersData.has(currentSharer) && peersData.get(currentSharer).stream) {
            recordingVideoStream = peersData.get(currentSharer).stream;
            reusedScreenShare = true;
        } else {
            try {
                recordingVideoStream = await navigator.mediaDevices.getDisplayMedia({ 
                    video: { 
                        cursor: "always",
                        width: { ideal: 1920, max: 1920 },
                        height: { ideal: 1080, max: 1080 },
                        frameRate: { ideal: 30 }
                    }, 
                    audio: true 
                });
                reusedScreenShare = false;
            } catch (screenErr) {
                console.warn("Display capture cancelled or unavailable, falling back to camera stream:", screenErr);
                recordingVideoStream = localStream;
                reusedScreenShare = true;
            }
        }

        // Initialize AudioContext to mix all voices
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        createRecordingAudioGraph();

        // 1. Add Local Mic
        connectRecordingAudioSource('local-mic', localStream);

        // 2. Add All Remote Peers
        peersData.forEach((p, peerId) => {
            connectRecordingAudioSource(`peer:${peerId}`, p.stream);
        });

        // 3. Add Screen System Audio (if any and not reusing)
        if (!reusedScreenShare) {
            connectRecordingAudioSource('display-audio', recordingVideoStream);
        }

        const mixedAudioTrack = audioDestination.stream.getAudioTracks()[0];
        const combinedStream = await createFullscreenRecordingStream(recordingVideoStream, mixedAudioTrack);
        
        mediaRecorder = new MediaRecorder(combinedStream, { 
            mimeType: 'video/webm;codecs=vp8,opus',
            videoBitsPerSecond: 3000000 // 3 Mbps for high quality video recording
        });
        
        mediaRecorder.ondataavailable = function(e) {
            if (e.data && e.data.size > 0) recordedChunks.push(e.data);
        };
        
        mediaRecorder.onstop = function() {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            recordedChunks = [];
            const fileName = `meeting-record-${new Date().getTime()}.webm`;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }, 100);
            
            // Trigger automatic Google Drive upload
            uploadToGoogleDrive(blob, fileName);

            isRecording = false;
            setRecordingUI(false);
            
            if (audioContext) {
                audioContext.close();
                audioContext = null;
            }
            resetRecordingAudioGraph();

            stopRecordingRenderer();
            
            // Broadcast recording stopped
            peersData.forEach(p => { if(p.connection) p.connection.send({type: 'recording-state', state: false}); });
        };
        
        mediaRecorder.start();
        isRecording = true;
        setRecordingUI(true);
        
        // Broadcast recording started
        peersData.forEach(p => { if(p.connection) p.connection.send({type: 'recording-state', state: true}); });
        
        if (!reusedScreenShare) {
            recordingVideoStream.getVideoTracks()[0].onended = () => {
                if(isRecording) stopRecording();
            };
        }

    } catch (err) {
        console.error("Error starting recording:", err);
        stopRecordingRenderer();
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }
        resetRecordingAudioGraph();
        if (!reusedScreenShare && recordingVideoStream) {
            recordingVideoStream.getTracks().forEach(track => track.stop());
        }
        alert("Could not start recording. If nobody is presenting, the host device may need its own screen capture permission.");
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        
        // Only stop the video track if we didn't reuse it from screen share
        if (!reusedScreenShare && recordingVideoStream) {
            recordingVideoStream.getVideoTracks().forEach(track => track.stop());
        }
    } else {
        stopRecordingRenderer();
    }
}

// Start app
init();
