import { AssistantService } from './service';
const service = new AssistantService();
chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  void service
    .handle(message, sender)
    .then(respond, () => respond({ ok: false, error: 'Operation unavailable.' }));
  return true;
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'idle-lock') void service.expireIfIdle();
});
chrome.tabs.onRemoved.addListener((tabId) => {
  void service.cancelTab(tabId);
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.url) void service.navigation(tabId, change.url);
});
chrome.permissions.onRemoved.addListener(() => {
  void service.permissionRemoved();
});
chrome.runtime.onInstalled.addListener(() => {
  void service.ready.then(() => service.lock());
});
chrome.runtime.onStartup.addListener(() => {
  void service.ready.then(() => service.lock());
});
