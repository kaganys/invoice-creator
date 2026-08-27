export function publicLandingHtml(): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Bitz Designs Payments</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #f3f5f7; color: #111; }
    main { max-width: 28rem; margin: 18vh auto; padding: 1.5rem; background: #fff; border-radius: 16px;
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12); text-align: center; }
    h1 { font-size: 1.25rem; margin: 0 0 0.75rem; }
    p { margin: 0; color: #4b5563; line-height: 1.5; }
  </style>
</head>
<body>
  <main>
    <h1>Bitz Designs</h1>
    <p>This site is for customer invoice payments only. Open the secure payment link from your invoice email.</p>
  </main>
</body>
</html>`
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

export function hostNotFoundHtml(message = 'Not found'): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Not found</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #f3f5f7; color: #111; }
    main { max-width: 28rem; margin: 18vh auto; padding: 1.5rem; background: #fff; border-radius: 16px;
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12); text-align: center; }
    h1 { font-size: 1.25rem; margin: 0 0 0.75rem; }
    p { margin: 0; color: #4b5563; line-height: 1.5; }
  </style>
</head>
<body>
  <main>
    <h1>Not found</h1>
    <p>${escapeHtml(message)}</p>
  </main>
</body>
</html>`
  return new Response(html, {
    status: 404,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

export function lockedWorkersDevHtml(): Response {
  return hostNotFoundHtml(
    'This workers.dev hostname is disabled for the admin application. Use invoice.vrfnw.com (Access) or pay.vrfnw.com for payments.',
  )
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
