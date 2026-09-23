/* ==========================================================================
   INDEX.JS — sign-in page logic
   ========================================================================== */

let selectedRole = null;

const roleChoiceEl = document.getElementById("roleChoice");
const loginFormEl = document.getElementById("loginForm");
const forgotConfirmEl = document.getElementById("forgotConfirm");

const loginTitleEl = document.getElementById("loginTitle");
const loginSubEl = document.getElementById("loginSub");
const emailInputEl = document.getElementById("emailInput");
const passwordInputEl = document.getElementById("passwordInput");
const loginErrorEl = document.getElementById("loginError");
const loginSubmitBtn = document.getElementById("loginSubmitBtn");

/* If already signed in, skip straight to the app. */
auth.onAuthStateChanged((user) => {
  if (user) {
    window.location.href = "pages/pos.html";
  }
});

/* Surface why a previous attempt bounced back here, if requireAuth()
   signed the user out and left a message (see auth.js). */
const loginErrorFromRedirect = sessionStorage.getItem("mc_login_error");
if (loginErrorFromRedirect) {
  sessionStorage.removeItem("mc_login_error");
  showToast(loginErrorFromRedirect, "danger");
}

loadAndApplyLogo();

/* ----- Step 1: role selection ------------------------------------------------- */
document.querySelectorAll(".role-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    selectedRole = btn.dataset.role;
    const email = FIXED_EMAILS[selectedRole];

    loginTitleEl.textContent = selectedRole === "manager" ? "Manager sign in" : "Seller sign in";
    loginSubEl.textContent = "Enter your password to continue.";
    emailInputEl.value = email;

    roleChoiceEl.classList.add("hidden");
    loginFormEl.classList.remove("hidden");
    forgotConfirmEl.classList.add("hidden");
    loginErrorEl.classList.add("hidden");
    passwordInputEl.value = "";
    passwordInputEl.focus();
  });
});

document.getElementById("backToRoles").addEventListener("click", () => {
  loginFormEl.classList.add("hidden");
  roleChoiceEl.classList.remove("hidden");
});

/* ----- Step 2: sign in ---------------------------------------------------------- */
loginFormEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginErrorEl.classList.add("hidden");
  loginSubmitBtn.disabled = true;
  loginSubmitBtn.textContent = "Signing in…";

  try {
    await auth.signInWithEmailAndPassword(emailInputEl.value, passwordInputEl.value);
    // onAuthStateChanged above will redirect once this resolves.
  } catch (err) {
    let message = "Something went wrong. Please try again.";
    if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
      message = "Incorrect password. Please try again.";
    } else if (err.code === "auth/user-not-found") {
      message = "No account found for this role yet. Ask the manager to set it up in Firebase.";
    } else if (err.code === "auth/too-many-requests") {
      message = "Too many attempts. Please wait a moment and try again.";
    } else if (err.code === "auth/network-request-failed") {
      message = "No connection. Check the internet and try again.";
    }
    loginErrorEl.textContent = message;
    loginErrorEl.classList.remove("hidden");
    document.getElementById("loginForm").querySelector(".login-card")?.classList.add("anim-shake");
    loginSubmitBtn.disabled = false;
    loginSubmitBtn.textContent = "Sign in";
  }
});

/* ----- Step 3: forgot password --------------------------------------------------- */
document.getElementById("forgotPasswordBtn").addEventListener("click", async () => {
  if (!selectedRole) return;
  const email = FIXED_EMAILS[selectedRole];
  try {
    await auth.sendPasswordResetEmail(email);
  } catch (err) {
    // Even on failure we don't want to leak whether the account exists;
    // show the same confirmation screen either way.
    console.warn("Password reset error:", err);
  }
  document.getElementById("forgotEmailShown").textContent = email;
  loginFormEl.classList.add("hidden");
  forgotConfirmEl.classList.remove("hidden");
});

document.getElementById("forgotBackBtn").addEventListener("click", () => {
  forgotConfirmEl.classList.add("hidden");
  loginFormEl.classList.remove("hidden");
});
