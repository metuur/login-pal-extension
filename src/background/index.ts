import { GroupService } from './groups';
const service = new GroupService();
chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  void service
    .handle(message, sender)
    .then(respond, () => respond({ ok: false, error: 'Operation unavailable.' }));
  return true;
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
