import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { reminderAt } from './logic.js';

const native = Capacitor.isNativePlatform();
const hash = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) || 1; };
let webTimers = [], queue = Promise.resolve();

export async function askPermission() {
  if (native) return (await LocalNotifications.requestPermissions()).display === 'granted';
  if (!('Notification' in window)) return false;
  return (await Notification.requestPermission()) === 'granted';
}

export function schedule(tasks) {
  const now = Date.now();
  const list = tasks.map(t => ({ t, at: reminderAt(t) })).filter(x => x.at && x.at > now).sort((a, b) => a.at - b.at);
  if (native) {
    queue = queue.then(async () => {
      if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
      const old = await LocalNotifications.getPending();
      if (old.notifications.length) await LocalNotifications.cancel({ notifications: old.notifications.map(n => ({ id: n.id })) });
      if (list.length) await LocalNotifications.schedule({
        notifications: list.slice(0, 200).map(({ t, at }) => ({
          id: hash(t.id), title: 'Pauta', body: t.title, schedule: { at, allowWhileIdle: true }
        }))
      });
    }).catch(console.error);
    return;
  }
  webTimers.forEach(clearTimeout);
  webTimers = list.filter(x => x.at - now < 864e5).map(({ t, at }) => setTimeout(() => {
    if ('Notification' in window && Notification.permission === 'granted') new Notification('Pauta', { body: t.title, tag: t.id });
  }, at - now));
}
