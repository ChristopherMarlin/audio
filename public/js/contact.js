/**
 * There's no backend endpoint to receive this form (the site has no mail
 * server), so submitting it opens the visitor's email client with the
 * message pre-filled instead of silently pretending to send it server-side.
 */
document.getElementById('contact-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('contact_name').value.trim();
  const email = document.getElementById('contact_email').value.trim();
  const subject = document.getElementById('contact_subject').value.trim();
  const message = document.getElementById('contact_message').value.trim();

  const body = `${message}\n\n— ${name} (${email})`;
  const mailto = `mailto:official@marlinrentals.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailto;

  document.getElementById('contact-alert').innerHTML =
    '<div class="alert alert-info">Opening your email app with this message pre-filled…</div>';
});
