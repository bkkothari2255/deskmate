// Small UI helpers shared by the side panel and the popup / mini office.
// No chrome.* in here: these run in the Chrome extension and in the Mac app alike.
import { STATUS, COFFEE_NOTE, isCoffeeBreak, initials } from './status.js';

export const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Availability colour as a design token (falls back to the JS colour). */
export const stColor = (key, fallback = STATUS[key]?.color || '#8C98A5') => `var(--st-${key}, ${fallback})`;

/** Deskmate logo mark: a little monitor on a desk, with a coffee cup. */
export const LOGO_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="12.5" height="8.5" rx="1.6"/><path d="M9.75 12.5v3M7 15.5h5.5"/><path class="warm" d="M2.5 19.5h19"/><path class="warm" d="M17.5 11h3.2v2.6a1.6 1.6 0 0 1-1.6 1.6 1.6 1.6 0 0 1-1.6-1.6z"/></svg>';

/** Cup on the desk: start or finish a coffee break. */
export function toggleCoffee(bridge, me) {
  if (isCoffeeBreak(me)) bridge.action('status', { state: 'desk' });
  else bridge.action('status', { state: 'brb', message: COFFEE_NOTE });
  return !isCoffeeBreak(me);
}

/** Teammates you could grab a coffee with: online and present (not focusing). */
export function coffeeCandidates(state) {
  const meId = state?.me?.id;
  return (state?.members || []).filter(m => m.id !== meId && m.online !== false && STATUS[m.state]?.present && m.state !== 'dnd');
}

let pop = null;
export function closeCoffeeChat() { pop?.remove(); pop = null; }

/** "Coffee chat" popover near the table: pick teammates, one call room for all of them. */
export function openCoffeeChat({ state, bridge, rect, toast }) {
  closeCoffeeChat();
  const people = coffeeCandidates(state);
  pop = document.createElement('div');
  pop.className = 'coffee-pop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Coffee chat');
  pop.innerHTML = `
    <h4>☕ Coffee chat</h4>
    <p>Invite teammates to a quick call at the coffee table.</p>
    ${people.length
      ? `<ul>${people.map(m => `<li><label><input type="checkbox" value="${esc(m.id)}"><span class="av" style="--c:${esc(m.color || '')}">${esc(initials(m.name))}</span><span>${esc(m.name)}</span></label></li>`).join('')}</ul>`
      : '<div class="empty">Nobody is free for coffee right now.</div>'}
    <div class="row"><button class="btn ghost" data-x>Cancel</button><button class="btn primary" data-go disabled>Invite</button></div>`;
  document.body.appendChild(pop);
  const go = pop.querySelector('[data-go]');
  const picked = () => [...pop.querySelectorAll('input:checked')].map(i => i.value);
  pop.addEventListener('change', () => { go.disabled = !picked().length; go.textContent = picked().length > 1 ? `Invite ${picked().length}` : 'Invite'; });
  pop.querySelector('[data-x]').onclick = closeCoffeeChat;
  go.onclick = () => {
    const to = picked();
    if (!to.length) return;
    bridge.action('call', { to });
    toast?.(to.length > 1 ? `Inviting ${to.length} teammates for coffee ☕` : 'Coffee invite sent ☕');
    closeCoffeeChat();
  };
  // place it under the table, kept on screen
  const W = pop.offsetWidth, H = pop.offsetHeight, pad = 8;
  const vw = innerWidth, vh = innerHeight;
  let x = rect ? rect.left + (rect.width || 0) / 2 - W / 2 : (vw - W) / 2;
  let y = rect ? (rect.bottom ?? rect.top + (rect.height || 0)) + 8 : (vh - H) / 2;
  if (y + H > vh - pad && rect) y = rect.top - H - 8;
  pop.style.left = `${Math.round(Math.min(Math.max(pad, x), vw - W - pad))}px`;
  pop.style.top = `${Math.round(Math.min(Math.max(pad, y), vh - H - pad))}px`;
  pop.querySelector('input')?.focus();
  return pop;
}
document.addEventListener('pointerdown', (e) => { if (pop && !pop.contains(e.target)) closeCoffeeChat(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCoffeeChat(); });

/**
 * DeskScene onInteract handler shared by both surfaces.
 * opts: { bridge, getState, toast, focusStatus }
 */
export function makeInteract({ bridge, getState, toast, focusStatus }) {
  return (kind, info = {}) => {
    const s = getState();
    if (!s) return;
    switch (kind) {
      case 'laptop': focusStatus?.(); break;
      case 'cup': {
        const on = toggleCoffee(bridge, s.me);
        toast?.(on ? 'Coffee break ☕ Enjoy!' : 'Back at your desk 💻');
        break;
      }
      case 'table': openCoffeeChat({ state: s, bridge, rect: info.rect, toast }); break;
      case 'plant': toast?.('🌱 Plants grow when you help a teammate or get kudos'); break;
      case 'room': toast?.('📅 A free meeting room — it lights up when someone’s in a meeting'); break;
      case 'emptyDesk': toast?.('This desk is free'); break;
      default: break; // chair, lamp…: the scene handles the visuals
    }
  };
}
