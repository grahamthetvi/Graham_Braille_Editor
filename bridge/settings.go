package main

import (
	"fmt"
	"net/http"
	"strings"
)

func handleSettingsPage(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	html := strings.ReplaceAll(settingsHTML, "{{BUILD_NUMBER}}", BuildNumber)
	fmt.Fprint(w, html)
}

const settingsHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Graham Bridge – Settings</title>
<style>
:root {
  --bg:#0f1117; --bg-surface:#161b22; --bg-overlay:#21262d; --border:#30363d;
  --text-primary:#e6edf3; --text-secondary:#8b949e; --accent:#58a6ff; --accent-hover:#1f6feb;
  --accent-text:#fff; --success:#3fb950; --error:#f85149;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text-primary);font-family:Inter,system-ui,sans-serif;line-height:1.5;padding:24px;max-width:720px;margin:0 auto}
h1{font-size:1.25rem;margin-bottom:4px}
h1 span{color:var(--accent)}
.sub{color:var(--text-secondary);font-size:.85rem;margin-bottom:24px}
section{background:var(--bg-surface);border:1px solid var(--border);border-radius:10px;padding:18px;margin-bottom:16px}
section h2{font-size:.95rem;margin-bottom:10px}
label{display:block;font-size:.8rem;color:var(--text-secondary);margin:10px 0 4px}
input[type=text],input[type=number]{width:100%;padding:8px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text-primary);font-size:.9rem}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}
button,.btn{background:var(--accent);color:var(--accent-text);border:none;border-radius:6px;padding:8px 14px;font-weight:700;cursor:pointer;font-size:.82rem}
button.secondary{background:var(--bg-overlay);color:var(--text-primary);border:1px solid var(--border)}
button:hover{background:var(--accent-hover)}
button.secondary:hover{border-color:var(--accent);color:var(--accent)}
.code{font-family:ui-monospace,monospace;font-size:1.4rem;letter-spacing:.2em;color:var(--success);margin:8px 0}
.hint{font-size:.8rem;color:var(--text-secondary);margin-top:8px}
.msg{font-size:.85rem;margin-top:10px}
.msg.ok{color:var(--success)}
.msg.err{color:var(--error)}
ul{list-style:none;margin-top:10px}
li{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-size:.85rem}
li:last-child{border-bottom:none}
.mode{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px}
.mode label{display:flex;align-items:center;gap:6px;color:var(--text-primary);font-size:.9rem;margin:0;cursor:pointer}
pre{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px 12px;font-size:.75rem;overflow-x:auto;margin:8px 0;white-space:pre-wrap}
details{margin-top:12px}
details summary{cursor:pointer;color:var(--accent);font-size:.85rem;font-weight:600}
.check{display:flex;align-items:center;gap:8px;margin:8px 0;font-size:.9rem;color:var(--text-primary)}
select{width:100%;padding:8px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text-primary);font-size:.9rem}
</style>
</head>
<body>
  <h1><span>Graham</span> Bridge — Settings <small style="opacity:.6;font-weight:400;font-size:.75rem">Build {{BUILD_NUMBER}}</small></h1>
  <p class="sub">Share this computer’s embosser on the LAN, connect to another shared Bridge, or watch a local folder (rclone) for .brf files. The web editor always talks to this local Bridge on port 8080. Email BRF in the editor is unchanged: senders still email or drop a .brf into Drive.</p>

  <section>
    <h2>Share on this network</h2>
    <div class="mode">
      <label><input type="radio" name="mode" value="local" id="mode-local"> This computer only</label>
      <label><input type="radio" name="mode" value="share" id="mode-share"> Share on this network</label>
    </div>
    <label for="share-name">Display name</label>
    <input id="share-name" type="text" placeholder="Room 12 Embosser" maxlength="80">
    <div class="row">
      <button type="button" id="btn-save-share">Save share settings</button>
      <button type="button" class="secondary" id="btn-regen">Regenerate code</button>
    </div>
    <div id="share-details" style="display:none;margin-top:12px">
      <div>Share code</div>
      <div class="code" id="share-code">------</div>
      <p class="hint">Teachers enter this computer’s IP (or hostname) and this code in their Bridge Settings. Share listens on TCP port 8081. Ask IT to allow device-to-device traffic and reserve a static IP if possible.</p>
    </div>
    <p class="msg" id="share-msg"></p>
  </section>

  <section>
    <h2>Inbox folder (rclone)</h2>
    <p class="hint">On this embosser computer, print every new <strong>.brf</strong> that appears in a local folder. Use rclone to pull files from a school Google Drive folder. Senders can still use <strong>Email BRF</strong> in the editor, then save the attachment into that Drive folder (or upload the .brf there). Graham never logs into Drive.</p>
    <label class="check"><input type="checkbox" id="inbox-enabled"> Watch this folder and emboss new .brf files</label>
    <label for="inbox-path">Folder path</label>
    <input id="inbox-path" type="text" placeholder="~/GrahamInbox" spellcheck="false">
    <label for="inbox-printer">Embosser (OS printer)</label>
    <select id="inbox-printer"></select>
    <p class="hint" style="margin-top:12px">This computer applies layout when auto-printing inbox <strong>.brf</strong> files. Sender Email BRF / Download BRF stay as they are; wrapping, page length, and left pad come from these settings, not the editor.</p>
    <label for="inbox-cells">Cells per row (braille per line)</label>
    <input id="inbox-cells" type="number" min="10" max="100" step="1" value="32">
    <label for="inbox-lines">Lines per page</label>
    <input id="inbox-lines" type="number" min="5" max="50" step="1" value="25">
    <label for="inbox-pad">Left padding (cells)</label>
    <input id="inbox-pad" type="number" min="-80" max="80" step="1" value="0">
    <p class="hint">Positive prefixes blank cells on each line (ViewPlus-style). Negative trims that many leading cells per line. Form-feed-only lines are not padded.</p>
    <div class="row">
      <button type="button" id="btn-save-inbox">Save inbox settings</button>
    </div>
    <p class="msg" id="inbox-msg"></p>
    <details>
      <summary>How to set up rclone (Linux, Windows, macOS)</summary>
      <ol class="hint" style="margin:10px 0 0 1.1rem;padding:0">
        <li>Keep <strong>Email BRF</strong> for sending: Export → Email BRF, attach the downloaded .brf. The person at the embosser (or a shared Drive folder) receives that file.</li>
        <li>In Google Drive (school account), create a folder such as <code>Graham Embosser Inbox</code> and share it with staff who should send jobs.</li>
        <li>On this computer, create a local folder (default <code>GrahamInbox</code> in your home directory).</li>
        <li>Install rclone from <a href="https://rclone.org/downloads/" target="_blank" rel="noopener noreferrer">rclone.org/downloads</a>, then run <code>rclone config</code> and add a Google Drive remote named <code>gdrive</code> (browser login).</li>
        <li>Pull files with <strong>rclone move</strong> on a timer — not <code>rclone sync</code> (sync can delete or restore files and fight Bridge). After a successful print, Bridge moves the file into <code>printed/</code> (failures go to <code>failed/</code>).</li>
      </ol>
      <p class="hint">Linux / macOS loop:</p>
<pre>mkdir -p ~/GrahamInbox
while true; do
  rclone move "gdrive:Graham Embosser Inbox" "$HOME/GrahamInbox" --include "*.brf"
  sleep 30
done</pre>
      <p class="hint">Windows Command Prompt loop:</p>
<pre>mkdir %USERPROFILE%\GrahamInbox
:loop
rclone move "gdrive:Graham Embosser Inbox" "%USERPROFILE%\GrahamInbox" --include "*.brf"
timeout /t 30
goto loop</pre>
      <p class="hint">Windows alternative: Google Drive for desktop can mirror the same Drive folder; point Inbox path at that local mirror. rclone is the Linux (and Pi) path, and also works on Windows/macOS.</p>
    </details>
  </section>

  <section>
    <h2>Connect to a shared Bridge</h2>
    <label for="peer-host">Host or IP</label>
    <input id="peer-host" type="text" placeholder="192.168.1.50 or embosser-room12">
    <label for="peer-code">Share code</label>
    <input id="peer-code" type="text" placeholder="6-digit code" maxlength="12">
    <div class="row">
      <button type="button" id="btn-pair">Pair</button>
    </div>
    <p class="msg" id="pair-msg"></p>
    <ul id="peer-list"></ul>
  </section>

<script>
async function load() {
  const s = await fetch('/settings/api').then(r => r.json());
  document.getElementById('mode-share').checked = !!s.shareEnabled;
  document.getElementById('mode-local').checked = !s.shareEnabled;
  document.getElementById('share-name').value = s.shareName || '';
  const details = document.getElementById('share-details');
  if (s.shareEnabled && s.shareCode) {
    details.style.display = '';
    document.getElementById('share-code').textContent = s.shareCode;
  } else {
    details.style.display = 'none';
  }
  const ul = document.getElementById('peer-list');
  ul.innerHTML = '';
  (s.pairedPeers || []).forEach(p => {
    const li = document.createElement('li');
    li.innerHTML = '<span><strong>'+esc(p.name)+'</strong> — '+esc(p.host)+'</span>';
    const btn = document.createElement('button');
    btn.className = 'secondary';
    btn.textContent = 'Remove';
    btn.onclick = async () => {
      await fetch('/settings/unpair', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id:p.id})});
      load();
    };
    li.appendChild(btn);
    ul.appendChild(li);
  });
  document.getElementById('inbox-enabled').checked = !!s.inboxEnabled;
  document.getElementById('inbox-path').value = s.inboxPath || '';
  const sel = document.getElementById('inbox-printer');
  const printers = s.localPrinters || [];
  const current = s.inboxPrinter || '';
  sel.innerHTML = '<option value="">(first local printer)</option>';
  printers.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (name === current) opt.selected = true;
    sel.appendChild(opt);
  });
  if (current && ![...sel.options].some(o => o.value === current)) {
    const opt = document.createElement('option');
    opt.value = current;
    opt.textContent = current + ' (not listed)';
    opt.selected = true;
    sel.appendChild(opt);
  }
  document.getElementById('inbox-cells').value = s.inboxCellsPerRow || 32;
  document.getElementById('inbox-lines').value = s.inboxLinesPerPage || 25;
  document.getElementById('inbox-pad').value = (s.inboxLeftPadCells == null ? 0 : s.inboxLeftPadCells);
}

document.getElementById('btn-save-share').onclick = async () => {
  const enabled = document.getElementById('mode-share').checked;
  const name = document.getElementById('share-name').value.trim();
  const msg = document.getElementById('share-msg');
  try {
    const r = await fetch('/settings/share', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({enabled, name})
    });
    const body = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(body.error || r.statusText);
    msg.className = 'msg ok';
    msg.textContent = enabled ? 'Share mode on. Give teachers the code below.' : 'Share mode off. Listening on this computer only.';
    load();
  } catch (e) {
    msg.className = 'msg err';
    msg.textContent = String(e.message || e);
  }
};

document.getElementById('btn-regen').onclick = async () => {
  const msg = document.getElementById('share-msg');
  try {
    const r = await fetch('/settings/regenerate-code', {method:'POST'});
    if (!r.ok) throw new Error(await r.text());
    msg.className = 'msg ok';
    msg.textContent = 'New code created. Teachers must pair again.';
    load();
  } catch (e) {
    msg.className = 'msg err';
    msg.textContent = String(e.message || e);
  }
};

document.getElementById('btn-pair').onclick = async () => {
  const host = document.getElementById('peer-host').value.trim();
  const code = document.getElementById('peer-code').value.trim();
  const msg = document.getElementById('pair-msg');
  try {
    const r = await fetch('/settings/pair', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({host, code})
    });
    const text = await r.text();
    if (!r.ok) throw new Error(text || r.statusText);
    msg.className = 'msg ok';
    msg.textContent = 'Paired. Shared embossers will appear in the Print panel.';
    document.getElementById('peer-code').value = '';
    load();
  } catch (e) {
    msg.className = 'msg err';
    msg.textContent = String(e.message || e);
  }
};

document.getElementById('btn-save-inbox').onclick = async () => {
  const enabled = document.getElementById('inbox-enabled').checked;
  const path = document.getElementById('inbox-path').value.trim();
  const printer = document.getElementById('inbox-printer').value.trim();
  const cellsPerRow = Number(document.getElementById('inbox-cells').value);
  const linesPerPage = Number(document.getElementById('inbox-lines').value);
  const leftPadCells = Number(document.getElementById('inbox-pad').value);
  const msg = document.getElementById('inbox-msg');
  try {
    const r = await fetch('/settings/inbox', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({enabled, path, printer, cellsPerRow, linesPerPage, leftPadCells})
    });
    const text = await r.text();
    let body = {};
    try { body = JSON.parse(text); } catch {}
    if (!r.ok) throw new Error(body.error || text || r.statusText);
    msg.className = 'msg ok';
    msg.textContent = enabled ? 'Inbox on. New .brf files will print using this computer\'s cells/row, lines/page, and left pad.' : 'Inbox off.';
    load();
  } catch (e) {
    msg.className = 'msg err';
    msg.textContent = String(e.message || e);
  }
};

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
load();
</script>
</body>
</html>`
