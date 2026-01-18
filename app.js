// ===== CONFIGURATION =====
const SUPABASE_URL = "https://hdauaegfmenlzhqnfgvy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkYXVhZWdmbWVubHpocW5mZ3Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0NDc0MzAsImV4cCI6MjA4MTAyMzQzMH0.8IHXBnKm6pE5cwBGPo7m0eIWdtVPsQDL1CUozebpNDE";
const IMGBB_API_KEY = "9360a2ebd6e3f0d47def9d8d34db622b";

// Initialize Supabase Client with persistence
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: 'potup-auth-token',
    flowType: 'pkce'
  }
});

// ===== GLOBAL STATE =====
let currentUser = null;
let currentUserProfile = null;
let viewedUserProfile = null;
let allPosts = [];
let displayedPostsCount = 0;
const POSTS_PER_LOAD = 10;
let isLoading = false;
let emojisLoaded = false;
let allEmojis = [];
let selectedPostCategory = null;
let userInterests = [];
let unreadNotifications = 0;
let userLikes = new Set();
let userReposts = new Set();
let currentReplyPostId = null;
let timeOnSite = 0;
let timerInterval = null;
let previousPage = 'homePage';

// Prevent multiple initializations
let isInitializing = false;
let isInitialized = false;
let authListenerSet = false;

// ===== SAFE ELEMENT HELPERS =====
function getElement(id) {
  return document.getElementById(id);
}

function safeSetSrc(id, src) {
  const el = getElement(id);
  if (el) el.src = src;
}

function safeSetText(id, text) {
  const el = getElement(id);
  if (el) el.textContent = text;
}

function safeSetHTML(id, html) {
  const el = getElement(id);
  if (el) el.innerHTML = html;
}

// ===== INITIALIZATION =====
document.addEventListener("DOMContentLoaded", async () => {
  console.log('🚀 DOM loaded, starting app...');
  
  // Setup auth forms first (always needed)
  setupAuthForms();
  
  // Check for shared links in URL
  const urlParams = new URLSearchParams(window.location.search);
  const sharedPostId = urlParams.get('post') || urlParams.get('p');
  const sharedProfileId = urlParams.get('profile') || urlParams.get('u');
  
  if (sharedPostId) {
    sessionStorage.setItem('pendingSharedPost', sharedPostId);
  }
  if (sharedProfileId) {
    sessionStorage.setItem('pendingSharedProfile', sharedProfileId);
  }

  // Check for existing session
  await checkAndInitializeSession();
  
  // Setup auth state listener (only once)
  if (!authListenerSet) {
    authListenerSet = true;
    
    sb.auth.onAuthStateChange(async (event, session) => {
      console.log('🔐 Auth event:', event);
      
      // Ignore INITIAL_SESSION as we handle it in checkAndInitializeSession
      if (event === 'INITIAL_SESSION') {
        return;
      }
      
      if (event === 'SIGNED_IN' && session?.user) {
        // Only initialize if not already done
        if (!isInitialized && !isInitializing) {
          currentUser = session.user;
          await initializeApp();
        }
      } else if (event === 'SIGNED_OUT') {
        handleSignOut();
      } else if (event === 'TOKEN_REFRESHED') {
        console.log('🔄 Token refreshed');
        if (session?.user) {
          currentUser = session.user;
        }
      }
    });
  }
});

async function checkAndInitializeSession() {
  try {
    console.log('🔍 Checking for existing session...');
    
    const { data: { session }, error } = await sb.auth.getSession();
    
    if (error) {
      console.error('❌ Session check error:', error);
      showAuthContainer();
      return;
    }
    
    if (session?.user) {
      console.log('✅ Found existing session for:', session.user.email);
      currentUser = session.user;
      await initializeApp();
    } else {
      console.log('ℹ️ No existing session found');
      showAuthContainer();
    }
  } catch (error) {
    console.error('❌ Session check failed:', error);
    showAuthContainer();
  }
}

function handleSignOut() {
  console.log('👋 User signed out');
  
  // Reset all state
  currentUser = null;
  currentUserProfile = null;
  viewedUserProfile = null;
  allPosts = [];
  displayedPostsCount = 0;
  userLikes = new Set();
  userReposts = new Set();
  userInterests = [];
  isInitialized = false;
  isInitializing = false;
  
  // Stop timer
  stopTimer();
  
  // Show auth
  showAuthContainer();
}

// ===== AUTH UI =====
function showAuthContainer() {
  const authContainer = getElement('authContainer');
  const appContainer = getElement('appContainer');
  
  if (authContainer) {
    authContainer.classList.remove('hidden');
    authContainer.style.display = 'flex';
  }
  if (appContainer) {
    appContainer.classList.add('hidden');
    appContainer.style.display = 'none';
  }
}

function showAppContainer() {
  const authContainer = getElement('authContainer');
  const appContainer = getElement('appContainer');
  
  if (authContainer) {
    authContainer.classList.add('hidden');
    authContainer.style.display = 'none';
  }
  if (appContainer) {
    appContainer.classList.remove('hidden');
    appContainer.style.display = 'flex';
  }
}

function showLoginPage() {
  const loginPage = getElement('loginPage');
  const signupPage = getElement('signupPage');
  
  if (loginPage) loginPage.classList.add('active');
  if (signupPage) signupPage.classList.remove('active');
  clearAuthErrors();
}

function showSignupPage() {
  const loginPage = getElement('loginPage');
  const signupPage = getElement('signupPage');
  
  if (loginPage) loginPage.classList.remove('active');
  if (signupPage) signupPage.classList.add('active');
  clearAuthErrors();
}

function showAuthError(elementId, message) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = message;
    el.classList.add('show');
  }
}

function clearAuthErrors() {
  const el = document.getElementById('signupError');
  if (el) {
    el.classList.remove('show');
    el.textContent = '';
  }
}

function togglePasswordVisibility(inputId, button) {
  const input = getElement(inputId);
  if (!input) return;
  
  const icon = button?.querySelector('.material-icons');
  
  if (input.type === 'password') {
    input.type = 'text';
    if (icon) icon.textContent = 'visibility';
  } else {
    input.type = 'password';
    if (icon) icon.textContent = 'visibility_off';
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function goToStep1() {
  const step1 = getElement('signupStep1');
  const step2 = getElement('signupStep2');
  if (step1) step1.classList.add('active');
  if (step2) step2.classList.remove('active');
  clearAuthErrors();
}

async function goToStep2() {
  // 1. Get Form Elements
  const usernameInput = document.getElementById('signupUsername');
  const emailInput = document.getElementById('signupEmail');
  const passwordInput = document.getElementById('signupPassword');
  const confirmPasswordInput = document.getElementById('signupConfirmPassword');
  const errorDiv = document.getElementById('signupError');

  // 2. Get Values
  const username = usernameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  // 3. Helper Function to show error in UI
  const showError = (message) => {
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
    errorDiv.style.display = 'block'; // Ensure it's visible
  };

  // 4. Clear previous errors
  errorDiv.textContent = '';
  errorDiv.classList.remove('show');
  errorDiv.style.display = 'none';

  // --- VALIDATION LOGIC ---

  // A. Username Length Check
  if (username.length < 3) {
    showError('Username must be at least 3 characters long.');
    return;
  }

  // B. Username Character Check (The specific error you requested)
  // Regex: Only allows a-z, A-Z, 0-9, and _ (No spaces, dots, or dashes)
  const usernameRegex = /^[a-zA-Z0-9_]+$/;
  if (!usernameRegex.test(username)) {
    showError('Auth error: Username can only contain letters, numbers, and underscores');
    return;
  }

  // C. Email Format Check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showError('Please enter a valid email address.');
    return;
  }

  // D. Password Length Check
  if (password.length < 6) {
    showError('Password must be at least 6 characters.');
    return;
  }

  // E. Password Match Check
  if (password !== confirmPassword) {
    showError('Passwords do not match.');
    return;
  }

  // --- DATABASE CHECK (Supabase) ---
  try {
    // Show a small hint that we are checking availability
    usernameInput.style.opacity = "0.5";
    
    const { data: existingUser, error: sbError } = await sb
      .from('user_profiles')
      .select('user_id')
      .eq('user_id', username)
      .maybeSingle();

    usernameInput.style.opacity = "1";

    if (sbError) throw sbError;

    if (existingUser) {
      showError('This username is already taken. Please try another.');
      return;
    }

    // --- SUCCESS: MOVE TO STEP 2 ---
    document.getElementById('signupStep1').classList.remove('active');
    document.getElementById('signupStep2').classList.add('active');
    
    // Smooth scroll to top of card for the new step
    document.querySelector('.signup-card').scrollTop = 0;

  } catch (err) {
    console.error('Check Username Error:', err);
    showError('Connection error. Please try again.');
    usernameInput.style.opacity = "1";
  }
}
// ===== AUTH FORMS SETUP =====
function setupAuthForms() {
  const loginForm = getElement('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  const signupForm = getElement('signupForm');
  if (signupForm) {
    signupForm.addEventListener('submit', handleSignup);
  }
  
  console.log('✅ Auth forms setup complete');
}

// ===== LOGIN HANDLER =====
async function handleLogin(e) {
  e.preventDefault();
  
  // Prevent if already initializing
  if (isInitializing) {
    console.log('⏳ Already initializing, please wait...');
    return;
  }
  
  const email = getElement('loginEmail')?.value.trim();
  const password = getElement('loginPassword')?.value;
  
  if (!email || !password) {
    showAuthError('loginError', 'Please enter email and password');
    return;
  }
  
  const btn = e.target.querySelector('.auth-btn');
  const btnText = btn?.querySelector('.btn-text');
  const btnLoader = btn?.querySelector('.btn-loader');
  
  if (btn) btn.disabled = true;
  if (btnText) btnText.classList.add('hidden');
  if (btnLoader) btnLoader.classList.remove('hidden');

  try {
    console.log('🔐 Logging in:', email);
    
    const { data, error } = await sb.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) throw error;

    console.log('✅ Login successful');
    
    // Set current user
    currentUser = data.user;
    
    // Initialize app directly (don't wait for auth state change)
    await initializeApp();
    
  } catch (error) {
    console.error('❌ Login failed:', error);
    
    let msg = 'Login failed. Please try again.';
    if (error.message?.includes('Invalid login credentials')) {
      msg = 'Invalid email or password';
    } else if (error.message?.includes('Email not confirmed')) {
      msg = 'Please verify your email first';
    } else if (error.message) {
      msg = error.message;
    }
    
    showAuthError('loginError', msg);
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.classList.remove('hidden');
    if (btnLoader) btnLoader.classList.add('hidden');
  }
}

// ===== SIGNUP HANDLER =====
async function handleSignup(e) {
  e.preventDefault();
  
  const btn = e.target.querySelector('.auth-btn.primary');
  const btnText = btn.querySelector('.btn-text');
  const btnLoader = btn.querySelector('.btn-loader');
  
  const username = getElement('signupUsername').value.trim();
  const email = getElement('signupEmail').value.trim();
  const password = getElement('signupPassword').value;
  const fullName = getElement('signupFullName').value.trim();
  const dob = getElement('signupDob').value;
  const gender = getElement('signupGender').value;
  const bio = getElement('signupBio').value.trim();

  clearAuthErrors();

  // Final sanity check for username (in case they bypassed Step 1)
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    showAuthError('signupError', 'Auth error: Username can only contain letters, numbers, and underscores');
    return;
  }

  if (!fullName || !dob || !gender) {
    showAuthError('signupError', 'Please fill in all required fields.');
    return;
  }


  try {
    // 1. Create Supabase Auth Account
    const { data: authData, error: authError } = await sb.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          username: username,
          full_name: fullName
        }
      }
    });

    if (authError) throw authError;

    if (authData.user) {
      // 2. Create Custom Profile
      const { error: profileError } = await sb
        .from('user_profiles')
        .insert({
          id: authData.user.id,
          user_id: username,
          email: email,
          full_name: fullName,
          dob: dob,
          gender: gender,
          bio: bio || "Hey there! I am using Potup.",
          avatar_url: 'https://i.imgur.com/6VBx3io.png',
          followers: 0,
          created_at: new Date().toISOString()
        });

      if (profileError) throw profileError;

      // Check if session exists (Auto-login) or if email verify is on
      if (authData.session) {
        showToast('Account created! Logging you in...', 'success');
        // initializeApp() will be triggered by onAuthStateChange
      } else {
        showToast('Account created! Please check your email to verify.', 'info');
        showLoginPage();
      }
    }

  } catch (error) {
    console.error('Signup Error:', error);
    let errorMsg = error.message;
    
    // Custom friendly messages for common Supabase Auth errors
    if (errorMsg.includes('already registered')) {
      errorMsg = "Email is already in use. Please sign in.";
    }
    
    showAuthError('signupError', errorMsg);
  } finally {
    btn.disabled = false;
    btnText.classList.remove('hidden');
    btnLoader.classList.add('hidden');
  }
}
// ===== APP INITIALIZATION =====
async function initializeApp() {
  // Prevent multiple simultaneous initializations
  if (isInitializing) {
    console.log('⏳ Already initializing...');
    return;
  }
  
  if (isInitialized) {
    console.log('✅ Already initialized');
    showAppContainer();
    return;
  }
  
  if (!currentUser) {
    console.error('❌ No user to initialize');
    showAuthContainer();
    return;
  }
  
  isInitializing = true;
  console.log('🚀 Initializing app for:', currentUser.email);
  
  showLoadingOverlay('Loading...');
  
  try {
    // Load profile
    const profileLoaded = await loadUserProfile();
    
    if (!profileLoaded || !currentUserProfile) {
      throw new Error('Could not load profile');
    }
    
    console.log('✅ Profile loaded:', currentUserProfile.user_id);
    
    // Load data in parallel
    await Promise.all([
      loadUserLikes(),
      loadUserReposts(),
      loadAllPosts()
    ]);
    
    // Display content
    displayPosts();
    setGreeting();
    updateNavUserInfo();
    
    // Non-critical loads (don't await)
    loadNotifications().catch(console.warn);
    loadNews().catch(console.warn);
    
    // Setup UI
    setupNavigation();
    setupMobileNavigation();
    setupAvatarUpload();
    setupBannerUpload();
    setupInfiniteScroll();
    setupEmojiPicker();
    setupCategorySelector();
    setupInterestsSelector();
    setupSearch();
    setupMobileSearch();
    setupCharCounter();
    setupImagePreview();
    setupProfileTabs();
    setupEditProfileForm();
    setupChangePasswordForm();
    setupDeleteAccountConfirmation();
    setupRealtimeSubscriptions();
    setupRefreshButton();
    
    // Start timer
    startTimer();
    
    // Show app
    showAppContainer();
    
    // Handle pending shared links
    const pendingPost = sessionStorage.getItem('pendingSharedPost');
    const pendingProfile = sessionStorage.getItem('pendingSharedProfile');
    
    if (pendingPost) {
      sessionStorage.removeItem('pendingSharedPost');
      setTimeout(() => handleSharedPost(pendingPost), 500);
    } else if (pendingProfile) {
      sessionStorage.removeItem('pendingSharedProfile');
      setTimeout(() => handleSharedProfile(pendingProfile), 500);
    }
    
    // Clear URL params
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    
    isInitialized = true;
    console.log('🎉 App initialized successfully!');
    
    showToast(`Welcome, ${currentUserProfile.user_id}!`, 'success');
    
  } catch (error) {
    console.error('❌ Initialization failed:', error);
    showToast('Failed to load. Please refresh.', 'error');
    
    // Don't sign out - let user try again
    showAuthContainer();
  } finally {
    isInitializing = false;
    hideLoadingOverlay();
  }
}

// ===== LOAD USER PROFILE =====
async function loadUserProfile() {
  if (!currentUser) {
    console.error('No current user');
    return false;
  }

  console.log('📋 Loading profile for:', currentUser.id);

  try {
    // Get existing profile
    const { data, error } = await sb
      .from('user_profiles')
      .select('*')
      .eq('id', currentUser.id)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Profile fetch error:', error);
      throw error;
    }

    if (data) {
      // Profile exists
      currentUserProfile = data;
      console.log('✅ Profile found:', data.user_id);
      
      userInterests = data.interests ? data.interests.split(',').filter(i => i.trim()) : [];
      
      safeSetSrc('composerAvatar', data.avatar_url || 'https://i.imgur.com/6VBx3io.png');
      safeSetSrc('replyComposerAvatar', data.avatar_url || 'https://i.imgur.com/6VBx3io.png');
      
      return true;
    }

    // Profile doesn't exist - create it
    console.log('📝 Creating new profile...');
    
    let username = currentUser.user_metadata?.username || 
                   currentUser.email?.split('@')[0] || 
                   'user_' + currentUser.id.slice(0, 8);
    
    username = username.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 20);

    // Check username availability
    const { data: existing } = await sb
      .from('user_profiles')
      .select('user_id')
      .eq('user_id', username)
      .maybeSingle();

    if (existing) {
      username = username + '_' + Math.random().toString(36).slice(2, 6);
    }

    const newProfile = {
      id: currentUser.id,
      user_id: username,
      email: currentUser.email,
      full_name: currentUser.user_metadata?.full_name || username,
      avatar_url: 'https://i.imgur.com/6VBx3io.png',
      followers: 0,
      created_at: new Date().toISOString()
    };

    // Add optional fields only if your table has them
    // Uncomment these if your table has these columns:
    // newProfile.bio = null;
    // newProfile.dob = null;
    // newProfile.gender = null;
    // newProfile.banner_url = null;
    // newProfile.badges = null;
    // newProfile.interests = null;

    const { data: created, error: createError } = await sb
      .from('user_profiles')
      .insert(newProfile)
      .select()
      .single();

    if (createError) {
      console.error('Profile creation failed:', createError);
      throw createError;
    }

    currentUserProfile = created;
    console.log('✅ Profile created:', created.user_id);
    
    userInterests = [];
    safeSetSrc('composerAvatar', 'https://i.imgur.com/6VBx3io.png');
    safeSetSrc('replyComposerAvatar', 'https://i.imgur.com/6VBx3io.png');
    
    return true;

  } catch (error) {
    console.error('loadUserProfile failed:', error);
    return false;
  }



  currentUserProfile = data;
  console.log('Profile loaded:', currentUserProfile.user_id);

  if (data.interests) {
    userInterests = data.interests.split(',').filter(i => i.trim());
  } else {
    userInterests = [];
  }

  // Update UI elements
  const avatarUrl = data.avatar_url || 'https://i.imgur.com/6VBx3io.png';
  safeSetSrc('composerAvatar', avatarUrl);
  safeSetSrc('replyComposerAvatar', avatarUrl);
}

function updateNavUserInfo() {
  if (!currentUserProfile) return;
  
  const avatarUrl = currentUserProfile.avatar_url || 'https://i.imgur.com/6VBx3io.png';
  safeSetSrc('navUserAvatar', avatarUrl);
  safeSetText('navUsername', currentUserProfile.user_id);
  safeSetText('navUserEmail', currentUserProfile.email || '');
}

async function loadProfilePage() {
  if (!currentUserProfile) return;

  const avatarUrl = currentUserProfile.avatar_url || 'https://i.imgur.com/6VBx3io.png';
  safeSetSrc('profileAvatar', avatarUrl);
  safeSetText('profileName', currentUserProfile.full_name || currentUserProfile.user_id);
  safeSetText('profileUsername', '@' + currentUserProfile.user_id);
  
  const profileEmail = getElement('profileEmail');
  if (profileEmail) {
    const emailSpan = profileEmail.querySelector('span:last-child');
    if (emailSpan) emailSpan.textContent = currentUserProfile.email || '';
  }
  
  const bioTextarea = getElement('profileBioText');
  if (bioTextarea) bioTextarea.value = currentUserProfile.bio || '';
  
  safeSetText('followersCount', currentUserProfile.followers || 0);

  // Gender
  const genderText = currentUserProfile.gender ? 
    currentUserProfile.gender.charAt(0).toUpperCase() + currentUserProfile.gender.slice(1) : 
    'Not specified';
  safeSetHTML('profileGender', `<span class="material-icons">wc</span> ${genderText}`);

  // DOB
  if (currentUserProfile.dob) {
    const dobDate = new Date(currentUserProfile.dob);
    const age = calculateAge(dobDate);
    safeSetHTML('profileDob', `<span class="material-icons">cake</span> ${age} years old`);
  }

  // Joined date
  if (currentUserProfile.created_at) {
    const joinedDate = new Date(currentUserProfile.created_at);
    safeSetHTML('profileJoined', `<span class="material-icons">calendar_today</span> Joined ${formatDate(joinedDate)}`);
  }

  // Following count
  const { data: followingData } = await sb
    .from('follows')
    .select('id')
    .eq('follower_id', currentUser.id);
  safeSetText('followingCount', followingData ? followingData.length : 0);

  // Posts count
  const { count: postsCount } = await sb
    .from('posts')
    .select('id', { count: 'exact' })
    .eq('author', currentUserProfile.user_id);
  safeSetText('postsCount', postsCount || 0);

  // Badges
  const badgesContainer = getElement('profileBadges');
  if (badgesContainer) {
    badgesContainer.innerHTML = '';
    if (currentUserProfile.badges) {
      currentUserProfile.badges.split(',').forEach(b => {
        const badge = b.trim().toLowerCase();
        badgesContainer.innerHTML += `<span class="badge ${badge}">${b.trim()}</span>`;
      });
    }
  }

  // Banner
  const profileBanner = getElement('profileBanner');
  if (profileBanner && currentUserProfile.banner_url) {
    profileBanner.style.backgroundImage = `url(${currentUserProfile.banner_url})`;
    profileBanner.style.backgroundSize = 'cover';
    profileBanner.style.backgroundPosition = 'center';
  }

  loadInterestsUI();
}

function calculateAge(birthDate) {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

function formatDate(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

async function updateBio() {
  const bioTextarea = getElement('profileBioText');
  if (!bioTextarea) return;
  
  const bio = bioTextarea.value;
  
  try {
    await sb.from('user_profiles').update({ bio }).eq('id', currentUser.id);
    currentUserProfile.bio = bio;
    showToast('Bio updated', 'success');
  } catch (error) {
    console.error('Failed to update bio:', error);
    showToast('Failed to update bio', 'error');
  }
}

// ===== SHARED LINKS HANDLING =====
async function handleSharedPost(postId) {
  try {
    showLoadingOverlay('Loading shared post...');
    
    const { data: post, error } = await sb
      .from('posts')
      .select('*')
      .eq('id', postId)
      .single();

    if (error || !post) {
      showToast('Post not found or has been deleted', 'error');
      hideLoadingOverlay();
      return;
    }

    const { data: profile } = await sb
      .from('user_profiles')
      .select('user_id, avatar_url, badges')
      .eq('user_id', post.author)
      .single();

    const [likesRes, repliesRes, repostsRes] = await Promise.all([
      sb.from('likes').select('post_id').eq('post_id', postId),
      sb.from('replies').select('post_id').eq('post_id', postId),
      sb.from('reposts').select('post_id').eq('post_id', postId)
    ]);

    post.actualLikes = likesRes.data ? likesRes.data.length : 0;
    post.actualReplies = repliesRes.data ? repliesRes.data.length : 0;
    post.actualReposts = repostsRes.data ? repostsRes.data.length : 0;
    post.profile = profile || {};

    navigateToPage('homePage');

    const feed = getElement('feed');
    if (!feed) {
      hideLoadingOverlay();
      return;
    }

    const postElement = createPostElement(post, true);
    
    const existingHighlighted = feed.querySelector('.post.highlighted');
    if (existingHighlighted) {
      existingHighlighted.classList.remove('highlighted');
    }

    feed.insertBefore(postElement, feed.firstChild);

    setTimeout(() => {
      postElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      showToast('Viewing shared post', 'info');
      
      setTimeout(() => {
        postElement.classList.remove('highlighted');
      }, 5000);
    }, 300);

  } catch (error) {
    console.error('Error loading shared post:', error);
    showToast('Failed to load shared post', 'error');
  } finally {
    hideLoadingOverlay();
  }
}

async function handleSharedProfile(profileId) {
  try {
    showLoadingOverlay('Loading profile...');
    
    let profile;
    
    // Try by UUID first
    const { data: profileById } = await sb
      .from('user_profiles')
      .select('*')
      .eq('id', profileId)
      .maybeSingle();

    if (profileById) {
      profile = profileById;
    } else {
      // Try by username
      const { data: profileByUsername } = await sb
        .from('user_profiles')
        .select('*')
        .eq('user_id', profileId)
        .maybeSingle();
      
      profile = profileByUsername;
    }

    if (!profile) {
      showToast('Profile not found', 'error');
      hideLoadingOverlay();
      return;
    }

    if (profile.id === currentUser.id) {
      navigateToPage('profilePage');
      await loadProfilePage();
      await loadUserPosts();
    } else {
      await openProfileModal(profile.user_id);
    }

  } catch (error) {
    console.error('Error loading shared profile:', error);
    showToast('Failed to load profile', 'error');
  } finally {
    hideLoadingOverlay();
  }
}

// ===== POSTS =====
async function loadUserLikes() {
  if (!currentUser) return;

  const { data } = await sb
    .from('likes')
    .select('post_id')
    .eq('user_id', currentUser.id);

  if (data) {
    userLikes = new Set(data.map(like => like.post_id));
  }
}

async function loadUserReposts() {
  if (!currentUser) return;

  const { data } = await sb
    .from('reposts')
    .select('post_id')
    .eq('user_id', currentUser.id);

  if (data) {
    userReposts = new Set(data.map(repost => repost.post_id));
  }
}

async function loadAllPosts() {
  const { data: posts, error } = await sb
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load posts:', error);
    return;
  }

  if (!posts || posts.length === 0) {
    allPosts = [];
    displayedPostsCount = 0;
    return;
  }

  const { data: profiles } = await sb
    .from('user_profiles')
    .select('user_id, avatar_url, badges');

  const postIds = posts.map(p => p.id);
  
  const [likesRes, repliesRes, repostsRes] = await Promise.all([
    sb.from('likes').select('post_id').in('post_id', postIds),
    sb.from('replies').select('post_id').in('post_id', postIds),
    sb.from('reposts').select('post_id').in('post_id', postIds)
  ]);

  const likeCountMap = {};
  const replyCountMap = {};
  const repostCountMap = {};

  if (likesRes.data) {
    likesRes.data.forEach(like => {
      likeCountMap[like.post_id] = (likeCountMap[like.post_id] || 0) + 1;
    });
  }

  if (repliesRes.data) {
    repliesRes.data.forEach(reply => {
      replyCountMap[reply.post_id] = (replyCountMap[reply.post_id] || 0) + 1;
    });
  }

  if (repostsRes.data) {
    repostsRes.data.forEach(repost => {
      repostCountMap[repost.post_id] = (repostCountMap[repost.post_id] || 0) + 1;
    });
  }

  let enrichedPosts = posts.map(p => {
    const prof = profiles?.find(u => u.user_id === p.author) || {};
    return {
      ...p,
      profile: prof,
      actualLikes: likeCountMap[p.id] || 0,
      actualReplies: replyCountMap[p.id] || 0,
      actualReposts: repostCountMap[p.id] || 0
    };
  });

  allPosts = applySmartAlgorithm(enrichedPosts);
  displayedPostsCount = 0;
}

function applySmartAlgorithm(posts) {
  const adPosts = posts.filter(p => p.profile.badges && p.profile.badges.toLowerCase().includes('ad'));
  const regularPosts = posts.filter(p => !(p.profile.badges && p.profile.badges.toLowerCase().includes('ad')));

  let relevantAdPosts = adPosts;
  if (userInterests.length > 0) {
    const interestedAds = adPosts.filter(p => userInterests.includes(p.type));
    const otherAds = adPosts.filter(p => !userInterests.includes(p.type));
    relevantAdPosts = [...shuffleArray(interestedAds), ...shuffleArray(otherAds)];
  } else {
    relevantAdPosts = shuffleArray(adPosts);
  }

  let sortedRegularPosts;
  if (userInterests.length === 0) {
    sortedRegularPosts = shuffleArray(regularPosts);
  } else {
    const interestedPosts = regularPosts.filter(p => userInterests.includes(p.type));
    const otherPosts = regularPosts.filter(p => !userInterests.includes(p.type));
    sortedRegularPosts = [...shuffleArray(interestedPosts), ...shuffleArray(otherPosts)];
  }

  const finalPosts = [];
  let adIndex = 0;

  for (let i = 0; i < sortedRegularPosts.length; i++) {
    finalPosts.push(sortedRegularPosts[i]);
    if ((i + 1) % 10 === 0 && adIndex < relevantAdPosts.length) {
      finalPosts.push(relevantAdPosts[adIndex]);
      adIndex++;
    }
  }

  while (adIndex < relevantAdPosts.length) {
    finalPosts.push(relevantAdPosts[adIndex]);
    adIndex++;
  }

  return finalPosts;
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function displayPosts() {
  if (isLoading) return;
  isLoading = true;

  const feed = getElement('feed');
  if (!feed) {
    isLoading = false;
    return;
  }

  const postsToShow = allPosts.slice(displayedPostsCount, displayedPostsCount + POSTS_PER_LOAD);

  if (postsToShow.length === 0 && displayedPostsCount === 0) {
    feed.innerHTML = `
      <div class="empty-state">
        <span class="material-icons">dynamic_feed</span>
        <h3>No posts yet</h3>
        <p>Be the first to share something!</p>
        <span class="action-link" onclick="navigateToPage('postPage')">Create a post</span>
      </div>
    `;
    isLoading = false;
    return;
  }

  postsToShow.forEach(post => {
    const postElement = createPostElement(post);
    feed.appendChild(postElement);
  });

  displayedPostsCount += postsToShow.length;
  isLoading = false;
}

function createPostElement(post, isHighlighted = false) {
  const avatarUrl = post.profile?.avatar_url || 'https://i.imgur.com/6VBx3io.png';

  let badgesHTML = '';
  if (post.profile?.badges) {
    post.profile.badges.split(',').forEach(b => {
      const badge = b.trim().toLowerCase();
      badgesHTML += `<span class="badge ${badge}">${b.trim()}</span>`;
    });
  }

  const timeAgo = getTimeAgo(new Date(post.created_at));
  const categoryEmojis = {
   fun: '🎉',
   gaming: '🕹️',
   education: '📚',
   tech: '💻',
   nature: '🌿',
   space: '🚀',
   entertainment: '✨',
   news: '📝',
   sport: '⚽',
   business: '💸',
   lifestyle: '🍷',
   creativity: '💡',
   other: '🟣'
  };
  const categoryLabel = post.type ? `${categoryEmojis[post.type] || ''} ${post.type}` : '';

  const isLiked = userLikes.has(post.id);
  const isReposted = userReposts.has(post.id);
  const likeIcon = isLiked ? 'favorite' : 'favorite_border';
  const likeClass = isLiked ? 'liked' : '';
  const repostClass = isReposted ? 'reposted' : '';

  const postElement = document.createElement('div');
  postElement.className = `post ${isHighlighted ? 'highlighted' : ''}`;
  postElement.setAttribute('data-post-id', post.id);

  const escapedContent = escapeHtml(post.content || '');
  const escapedAuthor = escapeHtml(post.author || 'Unknown');

  postElement.innerHTML = `
    <div class="post-content-wrapper">
      <img class="post-avatar" src="${avatarUrl}" alt="${escapedAuthor}" onerror="this.src='https://i.imgur.com/6VBx3io.png'">
      <div class="post-main">
        <div class="post-header">
          <span class="username">${escapedAuthor}</span>
          ${badgesHTML}
          <span class="post-time">· ${timeAgo}</span>
          ${categoryLabel ? `<span class="post-category">${categoryLabel}</span>` : ''}
        </div>
        <p class="post-text">${escapedContent}</p>
        ${post.image_url ? `<img class="post-img" src="${post.image_url}" alt="Post image" onerror="this.style.display='none'">` : ''}
        <div class="post-actions">
          <button class="action-btn like-btn ${likeClass}" data-post-id="${post.id}">
            <span class="material-icons">${likeIcon}</span>
            <span class="like-count">${post.actualLikes || 0}</span>
          </button>
          <button class="action-btn reply-btn" data-post-id="${post.id}" data-author="${escapedAuthor}">
            <span class="material-icons">chat_bubble_outline</span>
            <span class="reply-count">${post.actualReplies || 0}</span>
          </button>
          <button class="action-btn repost-btn ${repostClass}" data-post-id="${post.id}">
            <span class="material-icons">repeat</span>
            <span class="repost-count">${post.actualReposts || 0}</span>
          </button>
          <button class="action-btn share-btn" data-post-id="${post.id}">
            <span class="material-icons">share</span>
          </button>
        </div>
      </div>
    </div>
  `;

  // Add event listeners
  const avatar = postElement.querySelector('.post-avatar');
  const username = postElement.querySelector('.username');
  const likeBtn = postElement.querySelector('.like-btn');
  const replyBtn = postElement.querySelector('.reply-btn');
  const repostBtn = postElement.querySelector('.repost-btn');
  const shareBtn = postElement.querySelector('.share-btn');
  const postImg = postElement.querySelector('.post-img');

  if (avatar) avatar.addEventListener('click', (e) => { e.stopPropagation(); openProfileModal(post.author); });
  if (username) username.addEventListener('click', (e) => { e.stopPropagation(); openProfileModal(post.author); });
  if (likeBtn) likeBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleLike(post.id, likeBtn); });
  if (replyBtn) replyBtn.addEventListener('click', (e) => { e.stopPropagation(); openReplyModal(post.id, post.author); });
  if (repostBtn) repostBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleRepost(post.id, repostBtn); });
  if (shareBtn) shareBtn.addEventListener('click', (e) => { e.stopPropagation(); openShareModal('post', post.id); });
  if (postImg) postImg.addEventListener('click', (e) => { e.stopPropagation(); openLightbox(post.image_url); });

  return postElement;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 0) return 'just now';
  
  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60
  };

  for (let [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    if (interval >= 1) {
      return interval === 1 ? `1 ${unit} ago` : `${interval} ${unit}s ago`;
    }
  }
  return 'just now';
}

async function createPost() {
  const contentInput = getElement('postContent');
  if (!contentInput) return;

  const content = contentInput.value.trim();

  if (!content) {
    showToast('Please write something!', 'error');
    return;
  }

  if (!selectedPostCategory) {
    showToast('Please select a category!', 'error');
    return;
  }

  const btn = getElement('createPostBtn');
  if (!btn) return;

  const btnText = btn.querySelector('.btn-text');
  const btnLoader = btn.querySelector('.btn-loader');

  btn.disabled = true;
  if (btnText) btnText.classList.add('hidden');
  if (btnLoader) btnLoader.classList.remove('hidden');

  try {
    let imageUrl = null;
    const fileInput = getElement('postImage');
    if (fileInput && fileInput.files[0]) {
      imageUrl = await uploadImage(fileInput.files[0]);
    }

    const { data, error } = await sb.from('posts').insert({
      author: currentUserProfile.user_id,
      content: content,
      image_url: imageUrl,
      type: selectedPostCategory,
      likes: 0
    }).select().single();

    if (error) throw error;

    // Reset form
    contentInput.value = '';
    const charCounter = getElement('charCounter');
    if (charCounter) charCounter.textContent = '0 / 500';
    if (fileInput) fileInput.value = '';
    removeImagePreview();
    selectedPostCategory = null;
    document.querySelectorAll('#postCategoryOptions .category-option').forEach(opt => {
      opt.classList.remove('selected');
    });
    btn.disabled = true;

    showToast('Post created successfully!', 'success');

    // Refresh feed
    const feed = getElement('feed');
    if (feed) feed.innerHTML = '';
    displayedPostsCount = 0;
    await loadAllPosts();
    displayPosts();

    navigateToPage('homePage');

  } catch (error) {
    console.error('Failed to create post:', error);
    showToast('Failed to create post', 'error');
  } finally {
    btn.disabled = false;
    if (btnText) btnText.classList.remove('hidden');
    if (btnLoader) btnLoader.classList.add('hidden');
  }
}

async function loadUserPosts() {
  if (!currentUserProfile) return;

  const { data: posts } = await sb
    .from('posts')
    .select('*')
    .eq('author', currentUserProfile.user_id)
    .order('created_at', { ascending: false });

  const container = getElement('userPosts');
  if (!container) return;

  container.innerHTML = '';

  if (!posts || posts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-icons">post_add</span>
        <h3>No posts yet</h3>
        <p>Share your first thought with the world!</p>
        <span class="action-link" onclick="navigateToPage('postPage')">Create a post</span>
      </div>
    `;
    return;
  }

  const postIds = posts.map(p => p.id);
  const [likesRes, repliesRes, repostsRes] = await Promise.all([
    sb.from('likes').select('post_id').in('post_id', postIds),
    sb.from('replies').select('post_id').in('post_id', postIds),
    sb.from('reposts').select('post_id').in('post_id', postIds)
  ]);

  const likeCountMap = {};
  const replyCountMap = {};
  const repostCountMap = {};

  if (likesRes.data) likesRes.data.forEach(l => likeCountMap[l.post_id] = (likeCountMap[l.post_id] || 0) + 1);
  if (repliesRes.data) repliesRes.data.forEach(r => replyCountMap[r.post_id] = (replyCountMap[r.post_id] || 0) + 1);
  if (repostsRes.data) repostsRes.data.forEach(r => repostCountMap[r.post_id] = (repostCountMap[r.post_id] || 0) + 1);

  posts.forEach(post => {
    post.profile = currentUserProfile;
    post.actualLikes = likeCountMap[post.id] || 0;
    post.actualReplies = replyCountMap[post.id] || 0;
    post.actualReposts = repostCountMap[post.id] || 0;

    const postElement = createPostElement(post);
    container.appendChild(postElement);
  });
}

// ===== LIKES & REPOSTS =====
async function toggleLike(postId, button) {
  if (!button || button.disabled) return;
  button.disabled = true;

  const isCurrentlyLiked = userLikes.has(postId);

  try {
    if (isCurrentlyLiked) {
      await sb.from('likes').delete().eq('post_id', postId).eq('user_id', currentUser.id);
      userLikes.delete(postId);

      const icon = button.querySelector('.material-icons');
      const count = button.querySelector('.like-count');
      if (icon) icon.textContent = 'favorite_border';
      button.classList.remove('liked');
      if (count) count.textContent = Math.max(0, parseInt(count.textContent) - 1);
    } else {
      await sb.from('likes').insert({ post_id: postId, user_id: currentUser.id });
      userLikes.add(postId);

      const icon = button.querySelector('.material-icons');
      const count = button.querySelector('.like-count');
      if (icon) icon.textContent = 'favorite';
      button.classList.add('liked');
      if (count) count.textContent = parseInt(count.textContent) + 1;

      // Send notification
      const { data: post } = await sb.from('posts').select('author').eq('id', postId).single();
      if (post && post.author !== currentUserProfile.user_id) {
        const { data: authorProfile } = await sb
          .from('user_profiles')
          .select('id')
          .eq('user_id', post.author)
          .single();

        if (authorProfile) {
          await sb.from('notifications').insert({
            user_id: authorProfile.id,
            type: 'like',
            message: `<strong>${currentUserProfile.user_id}</strong> liked your post`,
            from_user: currentUserProfile.user_id,
            read: false
          });
        }
      }
    }
  } catch (error) {
    console.error('Error toggling like:', error);
    showToast('Failed to update like', 'error');
  } finally {
    button.disabled = false;
  }
}

async function toggleRepost(postId, button) {
  if (!button || button.disabled) return;
  button.disabled = true;

  const isCurrentlyReposted = userReposts.has(postId);

  try {
    if (isCurrentlyReposted) {
      await sb.from('reposts').delete().eq('post_id', postId).eq('user_id', currentUser.id);
      userReposts.delete(postId);

      button.classList.remove('reposted');
      const count = button.querySelector('.repost-count');
      if (count) count.textContent = Math.max(0, parseInt(count.textContent) - 1);

      showToast('Repost removed', 'success');
    } else {
      await sb.from('reposts').insert({ post_id: postId, user_id: currentUser.id });
      userReposts.add(postId);

      button.classList.add('reposted');
      const count = button.querySelector('.repost-count');
      if (count) count.textContent = parseInt(count.textContent) + 1;

      showToast('Reposted!', 'success');
    }
  } catch (error) {
    console.error('Error toggling repost:', error);
    showToast('Failed to repost', 'error');
  } finally {
    button.disabled = false;
  }
}

// ===== REPLIES =====
async function openReplyModal(postId, postAuthor) {
  currentReplyPostId = postId;

  const { data: post } = await sb.from('posts').select('content').eq('id', postId).single();

  const preview = getElement('originalPostPreview');
  if (preview) {
    preview.innerHTML = `
      <strong>@${escapeHtml(postAuthor)}</strong>
      <p>${escapeHtml(post?.content || '')}</p>
    `;
  }

  const replyContent = getElement('replyContent');
  if (replyContent) replyContent.value = '';

  const modal = getElement('replyModal');
  if (modal) modal.classList.add('show');

  await loadRepliesForPost(postId);
}

function closeReplyModal() {
  const modal = getElement('replyModal');
  if (modal) modal.classList.remove('show');
  currentReplyPostId = null;
}

async function loadRepliesForPost(postId) {
  const container = getElement('repliesList');
  if (!container) return;

  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

  const { data: replies } = await sb
    .from('replies')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: false });

  const countEl = getElement('repliesCount');
  if (countEl) countEl.textContent = replies ? replies.length : 0;

  if (!replies || replies.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No replies yet. Be the first!</p></div>';
    return;
  }

  const userIds = [...new Set(replies.map(r => r.user_id))];
  const { data: profiles } = await sb
    .from('user_profiles')
    .select('id, user_id, avatar_url, badges')
    .in('id', userIds);

  container.innerHTML = '';

  replies.forEach(reply => {
    const profile = profiles?.find(p => p.id === reply.user_id) || {};
    const avatarUrl = profile.avatar_url || 'https://i.imgur.com/6VBx3io.png';

    let badgesHTML = '';
    if (profile.badges) {
      profile.badges.split(',').forEach(b => {
        const badge = b.trim().toLowerCase();
        badgesHTML += `<span class="badge ${badge}">${b.trim()}</span>`;
      });
    }

    const timeAgo = getTimeAgo(new Date(reply.created_at));

    const replyElement = document.createElement('div');
    replyElement.className = 'reply-item';
    replyElement.innerHTML = `
      <img class="reply-avatar" src="${avatarUrl}" alt="${profile.user_id || 'User'}">
      <div class="reply-content-wrapper">
        <div class="reply-header">
          <span class="username">${escapeHtml(profile.user_id || 'Unknown')}</span>
          ${badgesHTML}
          <span class="post-time">· ${timeAgo}</span>
        </div>
        <p class="reply-text">${escapeHtml(reply.content)}</p>
      </div>
    `;

    const avatar = replyElement.querySelector('.reply-avatar');
    const username = replyElement.querySelector('.username');
    
    if (avatar && profile.user_id) avatar.addEventListener('click', () => openProfileModal(profile.user_id));
    if (username && profile.user_id) username.addEventListener('click', () => openProfileModal(profile.user_id));

    container.appendChild(replyElement);
  });
}

async function submitReply() {
  const contentInput = getElement('replyContent');
  if (!contentInput) return;

  const content = contentInput.value.trim();

  if (!content) {
    showToast('Please write a reply!', 'error');
    return;
  }

  if (!currentReplyPostId) return;

  const submitBtn = document.querySelector('.reply-submit-btn');
  if (submitBtn) submitBtn.disabled = true;

  try {
    await sb.from('replies').insert({
      post_id: currentReplyPostId,
      user_id: currentUser.id,
      content: content
    });

    // Update reply count in UI
    document.querySelectorAll(`[data-post-id="${currentReplyPostId}"]`).forEach(el => {
      if (el.classList.contains('reply-btn')) {
        const replyCount = el.querySelector('.reply-count');
        if (replyCount) replyCount.textContent = parseInt(replyCount.textContent) + 1;
      }
    });

    contentInput.value = '';
    await loadRepliesForPost(currentReplyPostId);

    showToast('Reply posted!', 'success');
  } catch (error) {
    console.error('Error posting reply:', error);
    showToast('Failed to post reply', 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

// ===== PROFILE MODAL =====
async function openProfileModal(username) {
  if (!username) return;

  const { data } = await sb
    .from('user_profiles')
    .select('*')
    .eq('user_id', username)
    .single();

  if (!data) {
    showToast('Profile not found', 'error');
    return;
  }

  viewedUserProfile = data;

  safeSetSrc('modalAvatar', data.avatar_url || 'https://i.imgur.com/6VBx3io.png');
  safeSetText('modalUserId', data.user_id);
  safeSetText('modalBio', data.bio || 'No bio yet.');
  safeSetText('modalFollowers', data.followers || 0);

  const { data: followingData } = await sb
    .from('follows')
    .select('id')
    .eq('follower_id', data.id);
  safeSetText('modalFollowing', followingData ? followingData.length : 0);

  const modalBadges = getElement('modalBadges');
  if (modalBadges) {
    modalBadges.innerHTML = '';
    if (data.badges) {
      data.badges.split(',').forEach(b => {
        const badge = b.trim().toLowerCase();
        modalBadges.innerHTML += `<span class="badge ${badge}">${b.trim()}</span>`;
      });
    }
  }

  await updateModalFollowButton();

  const modal = getElement('profileModal');
  if (modal) modal.classList.add('show');
}

function closeProfileModal() {
  const modal = getElement('profileModal');
  if (modal) modal.classList.remove('show');
  viewedUserProfile = null;
}

async function updateModalFollowButton() {
  const btn = getElement('modalFollowBtn');
  if (!btn || !viewedUserProfile) return;

  if (viewedUserProfile.id === currentUser.id) {
    btn.style.display = 'none';
    return;
  }

  const { data } = await sb
    .from('follows')
    .select('id')
    .eq('follower_id', currentUser.id)
    .eq('following_id', viewedUserProfile.id)
    .maybeSingle();

  btn.style.display = 'inline-block';
  btn.textContent = data ? 'Following' : 'Follow';
  btn.classList.toggle('following', !!data);
  btn.onclick = toggleModalFollow;
}

async function toggleModalFollow() {
  if (!viewedUserProfile) return;

  const { data } = await sb
    .from('follows')
    .select('id')
    .eq('follower_id', currentUser.id)
    .eq('following_id', viewedUserProfile.id)
    .maybeSingle();

  try {
    if (data) {
      await sb.from('follows').delete().eq('id', data.id);
      await sb.rpc('decrement_followers', { uid: viewedUserProfile.id });
      showToast(`Unfollowed @${viewedUserProfile.user_id}`, 'success');
    } else {
      await sb.from('follows').insert({
        follower_id: currentUser.id,
        following_id: viewedUserProfile.id
      });
      await sb.rpc('increment_followers', { uid: viewedUserProfile.id });

      await sb.from('notifications').insert({
        user_id: viewedUserProfile.id,
        type: 'follow',
        message: `<strong>${currentUserProfile.user_id}</strong> started following you`,
        from_user: currentUserProfile.user_id,
        read: false
      });

      showToast(`Following @${viewedUserProfile.user_id}`, 'success');
    }

    await updateModalFollowButton();

    const { data: profileData } = await sb
      .from('user_profiles')
      .select('followers')
      .eq('id', viewedUserProfile.id)
      .single();
    safeSetText('modalFollowers', profileData?.followers || 0);
  } catch (error) {
    console.error('Follow error:', error);
    showToast('Failed to update follow status', 'error');
  }
}

function viewFullProfile() {
  if (!viewedUserProfile) return;

  closeProfileModal();

  if (viewedUserProfile.id === currentUser.id) {
    navigateToPage('profilePage');
    loadProfilePage();
    loadUserPosts();
  } else {
    loadViewProfilePage(viewedUserProfile);
  }
}

async function loadViewProfilePage(profile) {
  previousPage = getCurrentActivePage();

  safeSetSrc('viewProfileAvatar', profile.avatar_url || 'https://i.imgur.com/6VBx3io.png');
  safeSetText('viewProfileName', profile.full_name || profile.user_id);
  safeSetText('viewProfileUsername', '@' + profile.user_id);
  safeSetText('viewProfileBio', profile.bio || 'No bio yet.');
  safeSetText('viewFollowersCount', profile.followers || 0);

  const viewBanner = getElement('viewProfileBanner');
  if (viewBanner) {
    if (profile.banner_url) {
      viewBanner.style.backgroundImage = `url(${profile.banner_url})`;
      viewBanner.style.backgroundSize = 'cover';
      viewBanner.style.backgroundPosition = 'center';
    } else {
      viewBanner.style.backgroundImage = '';
    }
  }

  if (profile.created_at) {
    const joinedDate = new Date(profile.created_at);
    safeSetHTML('viewProfileJoined', `<span class="material-icons">calendar_today</span> Joined ${formatDate(joinedDate)}`);
  }

  const { data: followingData } = await sb
    .from('follows')
    .select('id')
    .eq('follower_id', profile.id);
  safeSetText('viewFollowingCount', followingData ? followingData.length : 0);

  const { count: postsCount } = await sb
    .from('posts')
    .select('id', { count: 'exact' })
    .eq('author', profile.user_id);
  safeSetText('viewPostsCount', postsCount || 0);

  const badgesContainer = getElement('viewProfileBadges');
  if (badgesContainer) {
    badgesContainer.innerHTML = '';
    if (profile.badges) {
      profile.badges.split(',').forEach(b => {
        const badge = b.trim().toLowerCase();
        badgesContainer.innerHTML += `<span class="badge ${badge}">${b.trim()}</span>`;
      });
    }
  }

  viewedUserProfile = profile;
  await updateViewFollowButton();
  await loadViewUserPosts(profile.user_id);

  navigateToPage('viewProfilePage');
}

async function updateViewFollowButton() {
  const btn = getElement('viewFollowBtn');
  if (!btn || !viewedUserProfile) return;

  const { data } = await sb
    .from('follows')
    .select('id')
    .eq('follower_id', currentUser.id)
    .eq('following_id', viewedUserProfile.id)
    .maybeSingle();

  btn.textContent = data ? 'Following' : 'Follow';
  btn.classList.toggle('following', !!data);
  btn.onclick = toggleViewFollow;
}

async function toggleViewFollow() {
  if (!viewedUserProfile) return;

  const { data } = await sb
    .from('follows')
    .select('id')
    .eq('follower_id', currentUser.id)
    .eq('following_id', viewedUserProfile.id)
    .maybeSingle();

  try {
    if (data) {
      await sb.from('follows').delete().eq('id', data.id);
      await sb.rpc('decrement_followers', { uid: viewedUserProfile.id });
    } else {
      await sb.from('follows').insert({
        follower_id: currentUser.id,
        following_id: viewedUserProfile.id
      });
      await sb.rpc('increment_followers', { uid: viewedUserProfile.id });

      await sb.from('notifications').insert({
        user_id: viewedUserProfile.id,
        type: 'follow',
        message: `<strong>${currentUserProfile.user_id}</strong> started following you`,
        from_user: currentUserProfile.user_id,
        read: false
      });
    }

    await updateViewFollowButton();

    const { data: profileData } = await sb
      .from('user_profiles')
      .select('followers')
      .eq('id', viewedUserProfile.id)
      .single();
    safeSetText('viewFollowersCount', profileData?.followers || 0);
  } catch (error) {
    console.error('Follow error:', error);
    showToast('Failed to update follow status', 'error');
  }
}

async function loadViewUserPosts(username) {
  const { data: posts } = await sb
    .from('posts')
    .select('*')
    .eq('author', username)
    .order('created_at', { ascending: false });

  const container = getElement('viewUserPosts');
  if (!container) return;

  container.innerHTML = '';

  if (!posts || posts.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No posts yet.</p></div>';
    return;
  }

  const { data: profile } = await sb
    .from('user_profiles')
    .select('user_id, avatar_url, badges')
    .eq('user_id', username)
    .single();

  const postIds = posts.map(p => p.id);
  const [likesRes, repliesRes, repostsRes] = await Promise.all([
    sb.from('likes').select('post_id').in('post_id', postIds),
    sb.from('replies').select('post_id').in('post_id', postIds),
    sb.from('reposts').select('post_id').in('post_id', postIds)
  ]);

  const likeCountMap = {};
  const replyCountMap = {};
  const repostCountMap = {};

  if (likesRes.data) likesRes.data.forEach(l => likeCountMap[l.post_id] = (likeCountMap[l.post_id] || 0) + 1);
  if (repliesRes.data) repliesRes.data.forEach(r => replyCountMap[r.post_id] = (replyCountMap[r.post_id] || 0) + 1);
  if (repostsRes.data) repostsRes.data.forEach(r => repostCountMap[r.post_id] = (repostCountMap[r.post_id] || 0) + 1);

  posts.forEach(post => {
    post.profile = profile || {};
    post.actualLikes = likeCountMap[post.id] || 0;
    post.actualReplies = replyCountMap[post.id] || 0;
    post.actualReposts = repostCountMap[post.id] || 0;

    const postElement = createPostElement(post);
    container.appendChild(postElement);
  });
}

function goBackFromProfile() {
  navigateToPage(previousPage || 'homePage');
}

// ===== SHARE FUNCTIONALITY =====
let currentShareType = null;
let currentShareId = null;

function openShareModal(type, id) {
  currentShareType = type;
  currentShareId = id;

  let shareUrl;
  if (type === 'post') {
    shareUrl = `${window.location.origin}${window.location.pathname}?post=${id}`;
  } else if (type === 'profile') {
    shareUrl = `${window.location.origin}${window.location.pathname}?profile=${id}`;
  }

  const shareUrlInput = getElement('shareUrl');
  if (shareUrlInput) shareUrlInput.value = shareUrl;

  const modal = getElement('shareModal');
  if (modal) modal.classList.add('show');
}

function closeShareModal() {
  const modal = getElement('shareModal');
  if (modal) modal.classList.remove('show');
  currentShareType = null;
  currentShareId = null;
}

function copyShareUrl() {
  const input = getElement('shareUrl');
  if (!input) return;

  input.select();
  input.setSelectionRange(0, 99999);

  try {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(input.value);
    } else {
      document.execCommand('copy');
    }

    const btn = document.querySelector('.copy-url-btn');
    if (btn) {
      btn.classList.add('copied');
      btn.innerHTML = '<span class="material-icons">check</span>';

      showToast('Link copied to clipboard!', 'success');

      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = '<span class="material-icons">content_copy</span>';
      }, 2000);
    }
  } catch (error) {
    showToast('Failed to copy link', 'error');
  }
}

function shareToTwitter() {
  const input = getElement('shareUrl');
  if (!input) return;

  const url = input.value;
  const text = currentShareType === 'post' ? 'Check out this post on Potup!' : 'Check out this profile on Potup!';
  window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank');
}

function shareToWhatsApp() {
  const input = getElement('shareUrl');
  if (!input) return;

  const url = input.value;
  const text = currentShareType === 'post' ? 'Check out this post on Potup!' : 'Check out this profile on Potup!';
  window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`, '_blank');
}

function shareToTelegram() {
  const input = getElement('shareUrl');
  if (!input) return;

  const url = input.value;
  const text = currentShareType === 'post' ? 'Check out this post on Potup!' : 'Check out this profile on Potup!';
  window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank');
}

function shareProfile() {
  if (currentUser) {
    openShareModal('profile', currentUser.id);
  }
}

function shareViewedProfile() {
  if (viewedUserProfile) {
    openShareModal('profile', viewedUserProfile.id);
  }
}

function shareModalProfile() {
  if (viewedUserProfile) {
    openShareModal('profile', viewedUserProfile.id);
  }
}

// ===== NOTIFICATIONS =====
async function loadNotifications() {
  if (!currentUser) return;

  const { data: notifications } = await sb
    .from('notifications')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(50);

  const container = getElement('notificationsList');
  if (!container) return;

  if (!notifications || notifications.length === 0) {
    container.innerHTML = `
      <div class="no-notifications">
        <span class="material-icons">notifications_none</span>
        <h3>No notifications yet</h3>
        <p>When someone interacts with you, you'll see it here.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';

  notifications.forEach(notif => {
    let iconClass = 'system';
    let icon = 'campaign';

    if (notif.type === 'follow') {
      iconClass = 'follow';
      icon = 'person_add';
    } else if (notif.type === 'like') {
      iconClass = 'like';
      icon = 'favorite';
    } else if (notif.type === 'reply') {
      iconClass = 'reply';
      icon = 'chat_bubble';
    }

    const timeAgo = getTimeAgo(new Date(notif.created_at));

    const notifElement = document.createElement('div');
    notifElement.className = `notification-item ${notif.read ? '' : 'unread'}`;
    notifElement.innerHTML = `
      <div class="notification-icon ${iconClass}">
        <span class="material-icons">${icon}</span>
      </div>
      <div class="notification-content">
        <div class="notification-text">${notif.message}</div>
        <div class="notification-time">${timeAgo}</div>
      </div>
    `;

    if (notif.from_user) {
      notifElement.onclick = () => openProfileModal(notif.from_user);
      notifElement.style.cursor = 'pointer';
    }

    container.appendChild(notifElement);
  });

  updateNotificationBadge();
}

async function updateNotificationBadge() {
  if (!currentUser) return;

  const { count } = await sb
    .from('notifications')
    .select('id', { count: 'exact' })
    .eq('user_id', currentUser.id)
    .eq('read', false);

  const badge = getElement('notificationBadge');
  const mobileBadge = getElement('mobileNotificationBadge');

  if (count > 0) {
    const displayCount = count > 99 ? '99+' : count;
    if (badge) {
      badge.textContent = displayCount;
      badge.classList.remove('hidden');
    }
    if (mobileBadge) {
      mobileBadge.textContent = displayCount;
      mobileBadge.classList.remove('hidden');
    }
  } else {
    if (badge) badge.classList.add('hidden');
    if (mobileBadge) mobileBadge.classList.add('hidden');
  }

  unreadNotifications = count || 0;
}

async function markNotificationsAsRead() {
  if (!currentUser) return;

  await sb
    .from('notifications')
    .update({ read: true })
    .eq('user_id', currentUser.id)
    .eq('read', false);

  updateNotificationBadge();
}

async function markAllAsRead() {
  await markNotificationsAsRead();
  await loadNotifications();
  showToast('All notifications marked as read', 'success');
}

// ===== NAVIGATION =====
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', async () => {
      const pageId = item.getAttribute('data-page');
      if (pageId) {
        await handleNavigation(pageId);
        
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
      }
    });
  });
}

function setupMobileNavigation() {
  document.querySelectorAll('.mobile-nav-item').forEach(item => {
    item.addEventListener('click', async () => {
      const pageId = item.getAttribute('data-page');
      if (pageId) {
        await handleNavigation(pageId);

        document.querySelectorAll('.mobile-nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        const matchingNavItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
        if (matchingNavItem) matchingNavItem.classList.add('active');
      }
    });
  });
}

async function handleNavigation(pageId) {
  navigateToPage(pageId);

  if (pageId === 'profilePage') {
    await loadProfilePage();
    await loadUserPosts();
  } else if (pageId === 'notificationsPage') {
    await markNotificationsAsRead();
    await loadNotifications();
  }
}

function navigateToPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  
  const page = getElement(pageId);
  if (page) page.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.mobile-nav-item').forEach(i => i.classList.remove('active'));

  const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
  const mobileNavItem = document.querySelector(`.mobile-nav-item[data-page="${pageId}"]`);

  if (navItem) navItem.classList.add('active');
  if (mobileNavItem) mobileNavItem.classList.add('active');

  // Scroll to top of page
  window.scrollTo(0, 0);
  
  const feedScrollArea = document.querySelector('.feed-scroll-area');
  if (feedScrollArea) feedScrollArea.scrollTop = 0;
}

function getCurrentActivePage() {
  const activePage = document.querySelector('.page.active');
  return activePage ? activePage.id : 'homePage';
}

// ===== SEARCH =====
function setupSearch() {
  const searchInput = getElement('userSearch');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(searchUsers, 300));
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        searchUsers();
      }
    });
  }
}

function setupMobileSearch() {
  const btn = getElement('mobileSearchBtn');
  const modal = getElement('mobileSearchModal');
  const input = getElement('mobileUserSearch');

  if (btn) {
    btn.addEventListener('click', () => {
      if (modal) modal.classList.add('show');
      if (input) setTimeout(() => input.focus(), 100);
    });
  }

  if (input) {
    input.addEventListener('input', debounce(mobileSearchUsers, 300));
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        mobileSearchUsers();
      }
    });
  }
}

function closeMobileSearch() {
  const modal = getElement('mobileSearchModal');
  const input = getElement('mobileUserSearch');
  const results = getElement('mobileSearchResults');

  if (modal) modal.classList.remove('show');
  if (input) input.value = '';
  if (results) results.innerHTML = '';
}

async function searchUsers() {
  const input = getElement('userSearch');
  const container = getElement('searchResults');

  if (!input || !container) return;

  const query = input.value.trim();

  if (!query) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

  try {
    const { data: users, error } = await sb
      .from('user_profiles')
      .select('user_id, avatar_url, bio')
      .ilike('user_id', `%${query}%`)
      .limit(5);

    if (error) throw error;

    container.innerHTML = '';

    if (users && users.length > 0) {
      users.forEach(user => {
        const element = document.createElement('div');
        element.className = 'search-result-item';
        element.innerHTML = `
          <img src="${user.avatar_url || 'https://i.imgur.com/6VBx3io.png'}" class="search-result-avatar" alt="${user.user_id}">
          <div class="search-result-info">
            <h4>${escapeHtml(user.user_id)}</h4>
            <p>${user.bio ? escapeHtml(user.bio.substring(0, 50)) + '...' : 'No bio'}</p>
          </div>
        `;
        element.addEventListener('click', () => openProfileModal(user.user_id));
        container.appendChild(element);
      });
    } else {
      container.innerHTML = '<div class="empty-state"><p>No users found</p></div>';
    }
  } catch (error) {
    console.error('Search error:', error);
    container.innerHTML = '<div class="empty-state"><p>Search failed</p></div>';
  }
}

async function mobileSearchUsers() {
  const input = getElement('mobileUserSearch');
  const container = getElement('mobileSearchResults');

  if (!input || !container) return;

  const query = input.value.trim();

  if (!query) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

  try {
    const { data: users, error } = await sb
      .from('user_profiles')
      .select('user_id, avatar_url, bio')
      .ilike('user_id', `%${query}%`)
      .limit(5);

    if (error) throw error;

    container.innerHTML = '';

    if (users && users.length > 0) {
      users.forEach(user => {
        const element = document.createElement('div');
        element.className = 'search-result-item';
        element.innerHTML = `
          <img src="${user.avatar_url || 'https://i.imgur.com/6VBx3io.png'}" class="search-result-avatar" alt="${user.user_id}">
          <div class="search-result-info">
            <h4>${escapeHtml(user.user_id)}</h4>
            <p>${user.bio ? escapeHtml(user.bio.substring(0, 50)) + '...' : 'No bio'}</p>
          </div>
        `;
        element.addEventListener('click', () => {
          openProfileModal(user.user_id);
          closeMobileSearch();
        });
        container.appendChild(element);
      });
    } else {
      container.innerHTML = '<div class="empty-state"><p>No users found</p></div>';
    }
  } catch (error) {
    console.error('Mobile search error:', error);
    container.innerHTML = '<div class="empty-state"><p>Search failed</p></div>';
  }
}

// ===== IMAGE UPLOAD =====
function setupAvatarUpload() {
  const avatarUpload = getElement('avatarUpload');
  if (avatarUpload) {
    avatarUpload.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files[0]) {
        await handleAvatarUpload(e.target.files[0]);
      }
    });
  }
}

async function handleAvatarUpload(file) {
  // Validate file
  if (!file.type.startsWith('image/')) {
    showToast('Please select an image file', 'error');
    return;
  }

  if (file.size > 5 * 1024 * 1024) { // 5MB limit
    showToast('Image must be less than 5MB', 'error');
    return;
  }

  showLoadingOverlay('Uploading avatar...');

  try {
    const imageUrl = await uploadImage(file);
    
    const { error } = await sb
      .from('user_profiles')
      .update({ avatar_url: imageUrl })
      .eq('id', currentUser.id);

    if (error) throw error;

    // Update all avatar instances
    safeSetSrc('profileAvatar', imageUrl);
    safeSetSrc('composerAvatar', imageUrl);
    safeSetSrc('navUserAvatar', imageUrl);
    safeSetSrc('replyComposerAvatar', imageUrl);
    
    currentUserProfile.avatar_url = imageUrl;

    showToast('Avatar updated!', 'success');
  } catch (error) {
    console.error('Avatar upload failed:', error);
    showToast('Failed to upload avatar', 'error');
  } finally {
    hideLoadingOverlay();
  }
}

function setupBannerUpload() {
  const bannerUpload = getElement('bannerUpload');
  if (bannerUpload) {
    bannerUpload.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files[0]) {
        await handleBannerUpload(e.target.files[0]);
      }
    });
  }
}

async function handleBannerUpload(file) {
  if (!file.type.startsWith('image/')) {
    showToast('Please select an image file', 'error');
    return;
  }

  if (file.size > 10 * 1024 * 1024) { // 10MB limit
    showToast('Image must be less than 10MB', 'error');
    return;
  }

  showLoadingOverlay('Uploading banner...');

  try {
    const imageUrl = await uploadImage(file);
    
    const { error } = await sb
      .from('user_profiles')
      .update({ banner_url: imageUrl })
      .eq('id', currentUser.id);

    if (error) throw error;

    const profileBanner = getElement('profileBanner');
    if (profileBanner) {
      profileBanner.style.backgroundImage = `url(${imageUrl})`;
      profileBanner.style.backgroundSize = 'cover';
      profileBanner.style.backgroundPosition = 'center';
    }
    
    currentUserProfile.banner_url = imageUrl;

    showToast('Banner updated!', 'success');
  } catch (error) {
    console.error('Banner upload failed:', error);
    showToast('Failed to upload banner', 'error');
  } finally {
    hideLoadingOverlay();
  }
}

function setupImagePreview() {
  const postImage = getElement('postImage');
  if (postImage) {
    postImage.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        
        if (!file.type.startsWith('image/')) {
          showToast('Please select an image file', 'error');
          e.target.value = '';
          return;
        }

        if (file.size > 10 * 1024 * 1024) {
          showToast('Image must be less than 10MB', 'error');
          e.target.value = '';
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          const preview = getElement('imagePreview');
          const container = getElement('imagePreviewContainer');
          
          if (preview) preview.src = event.target.result;
          if (container) container.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
      }
    });
  }
}

function removeImagePreview() {
  const container = getElement('imagePreviewContainer');
  const preview = getElement('imagePreview');
  const input = getElement('postImage');

  if (container) container.classList.add('hidden');
  if (preview) preview.src = '';
  if (input) input.value = '';
}

async function uploadImage(file) {
  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
    method: 'POST',
    body: formData
  });

  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error?.message || 'Upload failed');
  }
  
  return data.data.url;
}

// ===== EMOJI PICKER =====
function setupEmojiPicker() {
  const btn = getElement('emojiBtn');
  const picker = getElement('emojiPicker');

  if (!btn || !picker) return;

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    
    const isHidden = picker.classList.contains('hidden');
    picker.classList.toggle('hidden');
    
    if (isHidden && !emojisLoaded) {
      await loadEmojis();
    }
  });

  document.addEventListener('click', (e) => {
    if (!picker.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
      picker.classList.add('hidden');
    }
  });

  // Emoji search
  const emojiSearch = getElement('emojiSearch');
  if (emojiSearch) {
    emojiSearch.addEventListener('input', debounce(filterEmojis, 200));
  }
}

async function loadEmojis() {
  const grid = getElement('emojiGrid');
  if (!grid) return;

  grid.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

  try {
    // Common emojis as fallback
    const commonEmojis = [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
      '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '☺️', '😚',
      '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
      '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥',
      '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮',
      '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎',
      '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳',
      '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖',
      '👍', '👎', '👊', '✊', '🤛', '🤜', '🤞', '✌️', '🤟', '🤘',
      '👌', '🤌', '🤏', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚',
      '🖐️', '🖖', '👋', '🤙', '💪', '🦾', '🙏', '🤝', '💯', '🔥',
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️'
    ];

    // Try to fetch from API first
    try {
      const categories = ['face-positive', 'face-negative', 'face-neutral'];
      const allEmojiPromises = categories.map(category =>
        fetch(`https://emojihub.yurace.pro/api/all/group/${category}`)
          .then(res => res.ok ? res.json() : [])
          .catch(() => [])
      );

      const results = await Promise.all(allEmojiPromises);
      allEmojis = results.flat();

      if (allEmojis.length > 0) {
        renderEmojis(allEmojis.map(emoji => {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = emoji.htmlCode[0];
          return { char: tempDiv.textContent, name: emoji.name };
        }));
        emojisLoaded = true;
        return;
      }
    } catch (apiError) {
      console.warn('Emoji API failed, using fallback:', apiError);
    }

    // Use fallback emojis
    allEmojis = commonEmojis.map(char => ({ char, name: '' }));
    renderEmojis(allEmojis);
    emojisLoaded = true;

  } catch (error) {
    console.error('Failed to load emojis:', error);
    grid.innerHTML = '<div class="empty-state"><p>Failed to load emojis</p></div>';
  }
}

function renderEmojis(emojis) {
  const grid = getElement('emojiGrid');
  if (!grid) return;

  grid.innerHTML = '';

  emojis.forEach(emoji => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'emoji-btn-item';
    button.innerHTML = emoji.char;
    button.title = emoji.name || '';
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      insertEmoji(emoji.char);
    });
    grid.appendChild(button);
  });
}

function filterEmojis() {
  const searchInput = getElement('emojiSearch');
  if (!searchInput || !allEmojis.length) return;

  const query = searchInput.value.toLowerCase().trim();
  
  if (!query) {
    renderEmojis(allEmojis);
    return;
  }

  const filtered = allEmojis.filter(emoji => 
    emoji.name && emoji.name.toLowerCase().includes(query)
  );
  
  renderEmojis(filtered.length ? filtered : allEmojis);
}

function insertEmoji(emoji) {
  const textarea = getElement('postContent');
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const newText = textarea.value.substring(0, start) + emoji + textarea.value.substring(end);
  
  textarea.value = newText;
  textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
  textarea.focus();

  // Trigger input event for char counter
  textarea.dispatchEvent(new Event('input'));
}

// ===== CATEGORY & INTERESTS =====
function setupCategorySelector() {
  document.querySelectorAll('#postCategoryOptions .category-option').forEach(option => {
    option.addEventListener('click', () => {
      document.querySelectorAll('#postCategoryOptions .category-option').forEach(opt => {
        opt.classList.remove('selected');
      });
      option.classList.add('selected');
      selectedPostCategory = option.getAttribute('data-category');
      validatePostForm();
    });
  });
}

function setupInterestsSelector() {
  document.querySelectorAll('#interestsGrid .interest-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      const interest = chip.getAttribute('data-interest');
      if (!interest) return;

      if (chip.classList.contains('selected')) {
        chip.classList.remove('selected');
        userInterests = userInterests.filter(i => i !== interest);
      } else {
        if (userInterests.length >= 3) {
          showToast('You can select up to 3 interests!', 'error');
          return;
        }
        chip.classList.add('selected');
        userInterests.push(interest);
      }

      // Update disabled state
      updateInterestsDisabledState();
      await saveInterests();
    });
  });
}

function updateInterestsDisabledState() {
  document.querySelectorAll('#interestsGrid .interest-chip').forEach(c => {
    if (!c.classList.contains('selected')) {
      c.disabled = userInterests.length >= 3;
      c.style.opacity = userInterests.length >= 3 ? '0.5' : '1';
      c.style.cursor = userInterests.length >= 3 ? 'not-allowed' : 'pointer';
    }
  });
}

async function saveInterests() {
  try {
    const { error } = await sb
      .from('user_profiles')
      .update({ interests: userInterests.join(',') })
      .eq('id', currentUser.id);

    if (error) throw error;

    currentUserProfile.interests = userInterests.join(',');

    // Refresh feed
    const feed = getElement('feed');
    if (feed) feed.innerHTML = '';
    displayedPostsCount = 0;
    await loadAllPosts();
    displayPosts();

    showToast('Interests updated!', 'success');
  } catch (error) {
    console.error('Failed to save interests:', error);
    showToast('Failed to update interests', 'error');
  }
}

function loadInterestsUI() {
  document.querySelectorAll('#interestsGrid .interest-chip').forEach(chip => {
    const interest = chip.getAttribute('data-interest');
    if (userInterests.includes(interest)) {
      chip.classList.add('selected');
    } else {
      chip.classList.remove('selected');
    }
  });
  updateInterestsDisabledState();
}

// ===== CHAR COUNTER =====
function setupCharCounter() {
  const textarea = getElement('postContent');
  const counter = getElement('charCounter');

  if (!textarea || !counter) return;

  textarea.addEventListener('input', () => {
    const length = textarea.value.length;
    counter.textContent = `${length} / 500`;

    counter.classList.remove('warning', 'error');
    if (length > 450) {
      counter.classList.add('error');
    } else if (length > 400) {
      counter.classList.add('warning');
    }

    validatePostForm();
  });
}

function validatePostForm() {
  const content = getElement('postContent');
  const btn = getElement('createPostBtn');
  
  if (!content || !btn) return;

  const hasContent = content.value.trim().length > 0;
  const hasCategory = selectedPostCategory !== null;
  
  btn.disabled = !(hasContent && hasCategory);
}

// ===== INFINITE SCROLL =====
function setupInfiniteScroll() {
  const feedScrollArea = document.querySelector('.feed-scroll-area');
  if (!feedScrollArea) return;

  feedScrollArea.addEventListener('scroll', () => {
    if (isLoading) return;

    const { scrollTop, scrollHeight, clientHeight } = feedScrollArea;

    if (scrollTop + clientHeight >= scrollHeight - 300) {
      if (displayedPostsCount < allPosts.length) {
        displayPosts();
      }
    }
  });
}

// ===== PROFILE TABS =====
function setupProfileTabs() {
  document.querySelectorAll('.profile-tab').forEach(tab => {
    tab.addEventListener('click', async () => {
      const tabName = tab.getAttribute('data-tab');
      if (!tabName) return;

      // Update active tab
      document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Hide all content
      const userPosts = getElement('userPosts');
      const userLikedPosts = getElement('userLikedPosts');
      const userRepostedPosts = getElement('userRepostedPosts');

      if (userPosts) userPosts.classList.add('hidden');
      if (userLikedPosts) userLikedPosts.classList.add('hidden');
      if (userRepostedPosts) userRepostedPosts.classList.add('hidden');

      // Show selected content
      if (tabName === 'posts') {
        if (userPosts) userPosts.classList.remove('hidden');
        await loadUserPosts();
      } else if (tabName === 'likes') {
        if (userLikedPosts) userLikedPosts.classList.remove('hidden');
        await loadUserLikedPosts();
      } else if (tabName === 'reposts') {
        if (userRepostedPosts) userRepostedPosts.classList.remove('hidden');
        await loadUserRepostedPosts();
      }
    });
  });
}

async function loadUserLikedPosts() {
  const container = getElement('userLikedPosts');
  if (!container) return;

  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

  try {
    const { data: likes } = await sb
      .from('likes')
      .select('post_id')
      .eq('user_id', currentUser.id);

    if (!likes || likes.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="material-icons">favorite_border</span>
          <h3>No liked posts</h3>
          <p>Posts you like will appear here.</p>
        </div>
      `;
      return;
    }

    const postIds = likes.map(l => l.post_id);
    
    const { data: posts } = await sb
      .from('posts')
      .select('*')
      .in('id', postIds)
      .order('created_at', { ascending: false });

    if (!posts || posts.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No posts found.</p></div>';
      return;
    }

    await renderPostsToContainer(container, posts);
  } catch (error) {
    console.error('Error loading liked posts:', error);
    container.innerHTML = '<div class="error-state"><p>Failed to load liked posts.</p></div>';
  }
}

async function loadUserRepostedPosts() {
  const container = getElement('userRepostedPosts');
  if (!container) return;

  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

  try {
    const { data: reposts } = await sb
      .from('reposts')
      .select('post_id')
      .eq('user_id', currentUser.id);

    if (!reposts || reposts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="material-icons">repeat</span>
          <h3>No reposts</h3>
          <p>Posts you repost will appear here.</p>
        </div>
      `;
      return;
    }

    const postIds = reposts.map(r => r.post_id);
    
    const { data: posts } = await sb
      .from('posts')
      .select('*')
      .in('id', postIds)
      .order('created_at', { ascending: false });

    if (!posts || posts.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No posts found.</p></div>';
      return;
    }

    await renderPostsToContainer(container, posts);
  } catch (error) {
    console.error('Error loading reposted posts:', error);
    container.innerHTML = '<div class="error-state"><p>Failed to load reposts.</p></div>';
  }
}

async function renderPostsToContainer(container, posts) {
  const authors = [...new Set(posts.map(p => p.author))];
  const { data: profiles } = await sb
    .from('user_profiles')
    .select('user_id, avatar_url, badges')
    .in('user_id', authors);

  const postIds = posts.map(p => p.id);
  const [likesRes, repliesRes, repostsRes] = await Promise.all([
    sb.from('likes').select('post_id').in('post_id', postIds),
    sb.from('replies').select('post_id').in('post_id', postIds),
    sb.from('reposts').select('post_id').in('post_id', postIds)
  ]);

  const likeCountMap = {};
  const replyCountMap = {};
  const repostCountMap = {};

  if (likesRes.data) likesRes.data.forEach(l => likeCountMap[l.post_id] = (likeCountMap[l.post_id] || 0) + 1);
  if (repliesRes.data) repliesRes.data.forEach(r => replyCountMap[r.post_id] = (replyCountMap[r.post_id] || 0) + 1);
  if (repostsRes.data) repostsRes.data.forEach(r => repostCountMap[r.post_id] = (repostCountMap[r.post_id] || 0) + 1);

  container.innerHTML = '';

  posts.forEach(post => {
    post.profile = profiles?.find(p => p.user_id === post.author) || {};
    post.actualLikes = likeCountMap[post.id] || 0;
    post.actualReplies = replyCountMap[post.id] || 0;
    post.actualReposts = repostCountMap[post.id] || 0;

    const postElement = createPostElement(post);
    container.appendChild(postElement);
  });
}

// ===== EDIT PROFILE =====
function setupEditProfileForm() {
  const form = getElement('editProfileForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fullNameInput = getElement('editFullName');
    const usernameInput = getElement('editUsername');
    const bioInput = getElement('editBio');
    const dobInput = getElement('editDob');
    const genderInput = getElement('editGender');

    if (!fullNameInput || !usernameInput) return;

    const fullName = fullNameInput.value.trim();
    const username = usernameInput.value.trim();
    const bio = bioInput ? bioInput.value.trim() : '';
    const dob = dobInput ? dobInput.value : '';
    const gender = genderInput ? genderInput.value : '';

    if (!fullName) {
      showToast('Full name is required', 'error');
      return;
    }

    if (!username || username.length < 3) {
      showToast('Username must be at least 3 characters', 'error');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      showToast('Username can only contain letters, numbers, and underscores', 'error');
      return;
    }

    // Check if username changed and is available
    if (username !== currentUserProfile.user_id) {
      const { data: existingUser } = await sb
        .from('user_profiles')
        .select('user_id')
        .eq('user_id', username)
        .maybeSingle();

      if (existingUser) {
        showToast('Username is already taken', 'error');
        return;
      }
    }

    const btn = form.querySelector('.save-profile-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Saving...';
    }

    try {
      const oldUsername = currentUserProfile.user_id;
      const updates = {
        full_name: fullName,
        user_id: username,
        bio: bio,
        dob: dob || null,
        gender: gender || null
      };

      const { error } = await sb
        .from('user_profiles')
        .update(updates)
        .eq('id', currentUser.id);

      if (error) throw error;

      // If username changed, update all posts
      if (username !== oldUsername) {
        await sb
          .from('posts')
          .update({ author: username })
          .eq('author', oldUsername);
      }

      currentUserProfile = { ...currentUserProfile, ...updates };

      updateNavUserInfo();
      await loadProfilePage();

      closeEditProfileModal();
      showToast('Profile updated successfully!', 'success');
    } catch (error) {
      console.error('Failed to update profile:', error);
      showToast('Failed to update profile', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Save Changes';
      }
    }
  });
}

function showEditProfileModal() {
  if (!currentUserProfile) return;

  const fullNameInput = getElement('editFullName');
  const usernameInput = getElement('editUsername');
  const bioInput = getElement('editBio');
  const dobInput = getElement('editDob');
  const genderInput = getElement('editGender');

  if (fullNameInput) fullNameInput.value = currentUserProfile.full_name || '';
  if (usernameInput) usernameInput.value = currentUserProfile.user_id || '';
  if (bioInput) bioInput.value = currentUserProfile.bio || '';
  if (dobInput) dobInput.value = currentUserProfile.dob || '';
  if (genderInput) genderInput.value = currentUserProfile.gender || '';

  const modal = getElement('editProfileModal');
  if (modal) modal.classList.add('show');
}

function closeEditProfileModal() {
  const modal = getElement('editProfileModal');
  if (modal) modal.classList.remove('show');
}

// ===== CHANGE PASSWORD =====
function setupChangePasswordForm() {
  const form = getElement('changePasswordForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const currentPasswordInput = getElement('currentPassword');
    const newPasswordInput = getElement('newPassword');
    const confirmPasswordInput = getElement('confirmNewPassword');

    if (!currentPasswordInput || !newPasswordInput || !confirmPasswordInput) return;

    const currentPassword = currentPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    hidePasswordError();

    if (!currentPassword || !newPassword || !confirmPassword) {
      showPasswordError('All fields are required');
      return;
    }

    if (newPassword.length < 6) {
      showPasswordError('New password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      showPasswordError('New passwords do not match');
      return;
    }

    const btn = form.querySelector('.save-password-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Updating...';
    }

    try {
      // Verify current password
      const { error: signInError } = await sb.auth.signInWithPassword({
        email: currentUserProfile.email,
        password: currentPassword
      });

      if (signInError) {
        showPasswordError('Current password is incorrect');
        return;
      }

      // Update password
      const { error: updateError } = await sb.auth.updateUser({
        password: newPassword
      });

      if (updateError) throw updateError;

      // Clear form
      currentPasswordInput.value = '';
      newPasswordInput.value = '';
      confirmPasswordInput.value = '';

      closeChangePasswordModal();
      showToast('Password updated successfully!', 'success');
    } catch (error) {
      console.error('Failed to update password:', error);
      showPasswordError(error.message || 'Failed to update password');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Update Password';
      }
    }
  });
}

function showChangePasswordModal() {
  const currentPasswordInput = getElement('currentPassword');
  const newPasswordInput = getElement('newPassword');
  const confirmPasswordInput = getElement('confirmNewPassword');

  if (currentPasswordInput) currentPasswordInput.value = '';
  if (newPasswordInput) newPasswordInput.value = '';
  if (confirmPasswordInput) confirmPasswordInput.value = '';

  hidePasswordError();

  const modal = getElement('changePasswordModal');
  if (modal) modal.classList.add('show');
}

function closeChangePasswordModal() {
  const modal = getElement('changePasswordModal');
  if (modal) modal.classList.remove('show');
}

function showPasswordError(message) {
  const errorDiv = getElement('passwordError');
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
  }
}

function hidePasswordError() {
  const errorDiv = getElement('passwordError');
  if (errorDiv) {
    errorDiv.textContent = '';
    errorDiv.classList.remove('show');
  }
}

// ===== DELETE ACCOUNT =====
function setupDeleteAccountConfirmation() {
  const input = getElement('deleteConfirmInput');
  const confirmBtn = getElement('confirmDeleteBtn');

  if (input && confirmBtn) {
    input.addEventListener('input', () => {
      confirmBtn.disabled = input.value !== currentUserProfile?.user_id;
    });
  }
}

function showDeleteAccountModal() {
  if (!currentUserProfile) return;

  const confirmUsername = getElement('confirmUsername');
  const input = getElement('deleteConfirmInput');
  const confirmBtn = getElement('confirmDeleteBtn');

  if (confirmUsername) confirmUsername.textContent = currentUserProfile.user_id;
  if (input) input.value = '';
  if (confirmBtn) confirmBtn.disabled = true;

  const modal = getElement('deleteAccountModal');
  if (modal) modal.classList.add('show');
}

function closeDeleteAccountModal() {
  const modal = getElement('deleteAccountModal');
  if (modal) modal.classList.remove('show');
}

async function deleteAccount() {
  const input = getElement('deleteConfirmInput');

  if (!input || input.value !== currentUserProfile.user_id) {
    showToast('Username does not match', 'error');
    return;
  }

  const btn = getElement('confirmDeleteBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Deleting...';
  }

  try {
    const userId = currentUser.id;
    const username = currentUserProfile.user_id;

    // Delete user's data in order
    await sb.from('posts').delete().eq('author', username);
    await sb.from('likes').delete().eq('user_id', userId);
    await sb.from('reposts').delete().eq('user_id', userId);
    await sb.from('replies').delete().eq('user_id', userId);
    await sb.from('notifications').delete().eq('user_id', userId);
    await sb.from('follows').delete().eq('follower_id', userId);
    await sb.from('follows').delete().eq('following_id', userId);
    await sb.from('user_profiles').delete().eq('id', userId);

    // Sign out
    await sb.auth.signOut();

    showToast('Account deleted successfully', 'success');

    setTimeout(() => {
      window.location.reload();
    }, 1500);
  } catch (error) {
    console.error('Failed to delete account:', error);
    showToast('Failed to delete account', 'error');
    
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Delete My Account';
    }
  }
}

// ===== REALTIME SUBSCRIPTIONS =====
function setupRealtimeSubscriptions() {
  if (!currentUser) return;

  // Subscribe to new notifications
  const notificationChannel = sb.channel(`notifications-${currentUser.id}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${currentUser.id}`
    }, (payload) => {
      console.log('New notification received:', payload);
      updateNotificationBadge();
      
      const message = payload.new.message?.replace(/<[^>]*>/g, '') || 'New notification';
      showToast(message, 'info');
    })
    .subscribe((status) => {
      console.log('Notification subscription status:', status);
    });

  // Subscribe to new posts
  const postsChannel = sb.channel('public-posts')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'posts'
    }, (payload) => {
      console.log('New post detected:', payload);
      // Could show a "new posts" indicator here
    })
    .subscribe((status) => {
      console.log('Posts subscription status:', status);
    });
}

// ===== REFRESH BUTTON =====
function setupRefreshButton() {
  const refreshBtn = getElement('refreshFeedBtn');
  if (!refreshBtn) return;

  refreshBtn.addEventListener('click', async () => {
    const icon = refreshBtn.querySelector('.material-icons');
    
    refreshBtn.disabled = true;
    if (icon) icon.style.animation = 'spin 1s linear infinite';

    try {
      const feed = getElement('feed');
      if (feed) feed.innerHTML = '';
      
      displayedPostsCount = 0;
      await loadAllPosts();
      displayPosts();

      const feedScrollArea = document.querySelector('.feed-scroll-area');
      if (feedScrollArea) feedScrollArea.scrollTo({ top: 0, behavior: 'smooth' });

      showToast('Feed refreshed', 'success');
    } catch (error) {
      console.error('Failed to refresh feed:', error);
      showToast('Failed to refresh feed', 'error');
    } finally {
      refreshBtn.disabled = false;
      if (icon) icon.style.animation = '';
    }
  });
}

// ===== TIMER =====
function startTimer() {
  if (!currentUser) return;

  const savedTime = localStorage.getItem(`timeOnSite_${currentUser.id}`);
  if (savedTime) {
    timeOnSite = parseInt(savedTime) || 0;
  }

  updateTimerDisplay();

  timerInterval = setInterval(() => {
    timeOnSite++;
    updateTimerDisplay();
    localStorage.setItem(`timeOnSite_${currentUser.id}`, timeOnSite.toString());
  }, 1000);
}

function updateTimerDisplay() {
  const hours = Math.floor(timeOnSite / 3600);
  const minutes = Math.floor((timeOnSite % 3600) / 60);
  const seconds = timeOnSite % 60;

  const display = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  const timerElement = getElement('timerDisplay');
  if (timerElement) timerElement.textContent = display;
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// ===== GREETING =====
function setGreeting() {
  const now = new Date();
  const hour = now.getHours();
  let greeting = 'Good morning';

  if (hour >= 12 && hour < 17) {
    greeting = 'Good afternoon';
  } else if (hour >= 17) {
    greeting = 'Good evening';
  }

  const greetingElement = getElement('greeting');
  if (greetingElement && currentUserProfile) {
    greetingElement.textContent = `${greeting}, ${currentUserProfile.user_id}`;
  }

  const subtextElement = getElement('feedSubtext');
  if (subtextElement) {
    subtextElement.textContent = "Here's your feed-";
  }
}

// ===== NEWS =====
async function loadNews() {
  const container = getElement('newsContainer');
  if (!container) return;

  try {
    const response = await fetch('https://api.rss2json.com/v1/api.json?rss_url=' +
      encodeURIComponent('https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en'));
    
    if (!response.ok) throw new Error('Failed to fetch news');
    
    const data = await response.json();

    if (data.items && data.items.length > 0) {
      container.innerHTML = '';

      data.items.slice(0, 3).forEach(item => {
        const newsElement = document.createElement('div');
        newsElement.className = 'news-item';
        newsElement.innerHTML = `
          <strong>${escapeHtml(item.title)}</strong>
          <span>${new Date(item.pubDate).toLocaleDateString()}</span>
        `;
        newsElement.addEventListener('click', () => window.open(item.link, '_blank'));
        container.appendChild(newsElement);
      });
    } else {
      throw new Error('No news items');
    }
  } catch (error) {
    console.error('Failed to load news:', error);
    container.innerHTML = '<div class="empty-state"><p>Unable to load news</p></div>';
  }
}

// ===== LIGHTBOX =====
function openLightbox(imageUrl) {
  if (!imageUrl) return;

  let lightbox = getElement('lightbox');

  if (!lightbox) {
    lightbox = document.createElement('div');
    lightbox.id = 'lightbox';
    lightbox.className = 'lightbox';
    lightbox.innerHTML = `
      <button class="lightbox-close">
        <span class="material-icons">close</span>
      </button>
      <img id="lightboxImage" src="" alt="Full size image">
    `;
    
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) closeLightbox();
    });
    
    const closeBtn = lightbox.querySelector('.lightbox-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeLightbox);
    }
    
    document.body.appendChild(lightbox);
  }

  const lightboxImage = getElement('lightboxImage');
  if (lightboxImage) lightboxImage.src = imageUrl;
  
  lightbox.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  const lightbox = getElement('lightbox');
  if (lightbox) {
    lightbox.classList.remove('show');
    document.body.style.overflow = '';
  }
}

// ===== TOAST NOTIFICATIONS =====
function showToast(message, type = 'info') {
  const container = getElement('toastContainer');
  if (!container) {
    console.log(`Toast (${type}): ${message}`);
    return;
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // Auto remove after 4 seconds
  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 300);
  }, 4000);
}

// ===== LOADING OVERLAY =====
function showLoadingOverlay(message = 'Loading...') {
  const overlay = getElement('loadingOverlay');
  if (overlay) {
    const text = overlay.querySelector('p');
    if (text) text.textContent = message;
    overlay.classList.remove('hidden');
  }
}

function hideLoadingOverlay() {
  const overlay = getElement('loadingOverlay');
  if (overlay) {
    overlay.classList.add('hidden');
  }
}

// ===== LOGOUT =====
async function logout() {
  try {
    stopTimer();
    
    const { error } = await sb.auth.signOut();
    if (error) throw error;

    currentUser = null;
    currentUserProfile = null;
    allPosts = [];
    displayedPostsCount = 0;
    userLikes = new Set();
    userReposts = new Set();
    userInterests = [];

    showToast('Logged out successfully', 'success');
  } catch (error) {
    console.error('Logout error:', error);
    showToast('Failed to logout', 'error');
  }
}

// ===== UTILITY FUNCTIONS =====
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function emailSupport() {
  window.location.href = 'mailto:tarchtechnologies@gmail.com?subject=Potup%20Support';
}

function showTermsModal() {
  showToast('Terms and Conditions - Coming soon', 'info');
}

function showPrivacyModal() {
  showToast('Privacy Policy - Coming soon', 'info');
}

function addPoll() {
  showToast('Poll feature coming soon!', 'info');
}

// ===== DEVICES =====
// ==============================
// Device Info System (Safe)
// ==============================

const DEVICE_CACHE_KEY = "device_info_cache_v1";
const DEVICE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

async function populateDevices() {
  const devicesList = getElement("devicesList");
  if (!devicesList) return;

  // Render instantly with local info
  const deviceInfo = getDeviceInfo();

  devicesList.innerHTML = "";

  const row = document.createElement("div");
  row.className = "settings-item no-hover";
  row.innerHTML = `
    <div class="settings-item-left">
      <span class="material-icons">${deviceInfo.deviceIcon}</span>
      <div class="item-text">
        <h4>${deviceInfo.osName} · ${deviceInfo.browserName}</h4>
        <p id="deviceLocationLine">Loading network info...</p>
      </div>
    </div>
    <span class="status-indicator online"></span>
  `;
  devicesList.appendChild(row);

  // Load network info in background (never block UI)
  loadNetworkInfoSafe()
    .then(({ ip, location }) => {
      const line = row.querySelector("#deviceLocationLine");
      if (line) {
        line.textContent = `IP: ${ip} · ${location} (Current)`;
      }
    })
    .catch(() => {
      const line = row.querySelector("#deviceLocationLine");
      if (line) {
        line.textContent = `IP: Unknown · Unknown location (Current)`;
      }
    });
}

// ==============================
// CACHED NETWORK INFO
// ==============================

async function loadNetworkInfoSafe() {
  // Check cache first
  try {
    const cached = localStorage.getItem(DEVICE_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.time < DEVICE_CACHE_TTL) {
        return parsed.data;
      }
    }
  } catch {}

  // Fetch fresh (best effort)
  const ip = await getIPAddressSafe();
  const location = await getLocationSafe(ip);

  const data = { ip, location };

  // Save cache
  try {
    localStorage.setItem(
      DEVICE_CACHE_KEY,
      JSON.stringify({ time: Date.now(), data })
    );
  } catch {}

  return data;
}

// ==============================
// DEVICE INFO (LOCAL)
// ==============================

function getDeviceInfo() {
  const ua = navigator.userAgent;
  let deviceIcon = "computer";
  let osName = "Unknown OS";
  let browserName = "Unknown Browser";

  // OS detection
  if (ua.includes("Win")) osName = "Windows";
  else if (ua.includes("Mac")) osName = "macOS";
  else if (ua.includes("Linux")) osName = "Linux";
  else if (ua.includes("Android")) {
    osName = "Android";
    deviceIcon = "smartphone";
  } else if (ua.includes("iPhone") || ua.includes("iPad")) {
    osName = ua.includes("iPad") ? "iPad" : "iPhone";
    deviceIcon = "smartphone";
  }

  // Browser detection
  if (ua.includes("Edg")) browserName = "Edge";
  else if (ua.includes("OPR") || ua.includes("Opera")) browserName = "Opera";
  else if (ua.includes("Firefox")) browserName = "Firefox";
  else if (ua.includes("Chrome")) browserName = "Chrome";
  else if (ua.includes("Safari")) browserName = "Safari";

  return { deviceIcon, osName, browserName };
}

// ==============================
// IP FETCH (SAFE)
// ==============================

async function getIPAddressSafe() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch("https://api.ipify.org?format=json", {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data = await res.json();
    return data.ip || "Unknown";
  } catch {
    return "Unknown";
  }
}

// ==============================
// GEO FETCH (SAFE)
// ==============================

async function getLocationSafe(ip) {
  try {
    if (!ip || ip === "Unknown") return "Unknown location";

    // ipapi is unreliable from browser → so we treat it as optional
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) throw new Error("Geo blocked");

    const data = await res.json();

    if (data.city && data.country_name) {
      return `${data.city}, ${data.country_name}`;
    }

    return "Unknown location";
  } catch {
    return "Unknown location";
  }
}

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', (e) => {
  // Close modals on Escape
  if (e.key === 'Escape') {
    closeProfileModal();
    closeReplyModal();
    closeShareModal();
    closeMobileSearch();
    closeEditProfileModal();
    closeChangePasswordModal();
    closeDeleteAccountModal();
    closeLightbox();
    
    const emojiPicker = getElement('emojiPicker');
    if (emojiPicker) emojiPicker.classList.add('hidden');
  }

  // Quick navigation (when not typing)
  if (document.activeElement.tagName !== 'INPUT' &&
      document.activeElement.tagName !== 'TEXTAREA' &&
      document.activeElement.tagName !== 'SELECT') {

    if (e.key === 'h' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      navigateToPage('homePage');
    }
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      navigateToPage('notificationsPage');
      markNotificationsAsRead();
      loadNotifications();
    }
    if (e.key === 'p' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      navigateToPage('profilePage');
      loadProfilePage();
      loadUserPosts();
    }
    if (e.key === 'c' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      navigateToPage('postPage');
    }
  }
});

// ===== VISIBILITY CHANGE =====
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopTimer();
  } else if (currentUser) {
    startTimer();
  }
});

// ===== ONLINE/OFFLINE DETECTION =====
window.addEventListener('online', () => {
  showToast('You are back online', 'success');
  
  const offlineBanner = document.querySelector('.offline-banner');
  if (offlineBanner) offlineBanner.classList.remove('show');
});

window.addEventListener('offline', () => {
  showToast('You are offline', 'error');

  let offlineBanner = document.querySelector('.offline-banner');
  if (!offlineBanner) {
    offlineBanner = document.createElement('div');
    offlineBanner.className = 'offline-banner';
    offlineBanner.textContent = 'You are currently offline';
    document.body.prepend(offlineBanner);
  }
  offlineBanner.classList.add('show');
});

// ===== SETTINGS PAGE OBSERVER =====
const settingsObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
      const target = mutation.target;
      if (target.id === 'settingsPage' && target.classList.contains('active')) {
        populateDevices();
      }
    }
  });
});

// Start observing when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const settingsPage = getElement('settingsPage');
  if (settingsPage) {
    settingsObserver.observe(settingsPage, { attributes: true });
  }
});

// ===== WINDOW BEFOREUNLOAD =====
window.addEventListener('beforeunload', () => {
  stopTimer();
});

// ===== EXPOSE FUNCTIONS GLOBALLY =====
// These functions need to be accessible from onclick handlers in HTML
window.showLoginPage = showLoginPage;
window.showSignupPage = showSignupPage;
window.goToStep1 = goToStep1;
window.goToStep2 = goToStep2;
window.togglePasswordVisibility = togglePasswordVisibility;
window.navigateToPage = navigateToPage;
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.viewFullProfile = viewFullProfile;
window.openReplyModal = openReplyModal;
window.closeReplyModal = closeReplyModal;
window.submitReply = submitReply;
window.openShareModal = openShareModal;
window.closeShareModal = closeShareModal;
window.copyShareUrl = copyShareUrl;
window.shareToTwitter = shareToTwitter;
window.shareToWhatsApp = shareToWhatsApp;
window.shareToTelegram = shareToTelegram;
window.shareProfile = shareProfile;
window.shareViewedProfile = shareViewedProfile;
window.shareModalProfile = shareModalProfile;
window.closeMobileSearch = closeMobileSearch;
window.removeImagePreview = removeImagePreview;
window.createPost = createPost;
window.updateBio = updateBio;
window.goBackFromProfile = goBackFromProfile;
window.showEditProfileModal = showEditProfileModal;
window.closeEditProfileModal = closeEditProfileModal;
window.showChangePasswordModal = showChangePasswordModal;
window.closeChangePasswordModal = closeChangePasswordModal;
window.showDeleteAccountModal = showDeleteAccountModal;
window.closeDeleteAccountModal = closeDeleteAccountModal;
window.deleteAccount = deleteAccount;
window.markAllAsRead = markAllAsRead;
window.logout = logout;
window.emailSupport = emailSupport;
window.showTermsModal = showTermsModal;
window.showPrivacyModal = showPrivacyModal;
window.addPoll = addPoll;
window.openLightbox = openLightbox;
window.closeLightbox = closeLightbox;

console.log('Potup App Loaded Successfully! 🚀');
