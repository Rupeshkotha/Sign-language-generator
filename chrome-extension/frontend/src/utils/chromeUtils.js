/* global chrome */  // This tells ESLint that chrome is available globally

// Chrome Extension Utility Functions

export const sendMessageToActiveTab = (message) => {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, message);
    }
  });
};

export const getStorageData = (key) => {
  return new Promise((resolve) => {
    chrome.storage.sync.get(key, resolve);
  });
};

export const setStorageData = (data) => {
  return new Promise((resolve) => {
    chrome.storage.sync.set(data, resolve);
  });
};

export const listenForMessages = (callback) => {
  chrome.runtime.onMessage.addListener(callback);
};

export const removeMessageListener = (callback) => {
  chrome.runtime.onMessage.removeListener(callback);
};

export const getUserSettings = async () => {
  return await getStorageData('userSettings');
};

export const setUserSettings = async (settings) => {
  await setStorageData({ userSettings: settings });
};