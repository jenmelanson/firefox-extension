'use strict';

const schemeSet = {
  all : 1,
  http: 2,
  https: 4
};
const FOR_ALL = {originalPattern: chrome.i18n.getMessage('forAll')}
const DIRECT_SETTING = {type: 'direct'};

function findProxyMatch(url, activeSettings) {
  // note: we've already thrown out inactive settings and inactive patterns in background.js.
  // we're not iterating over them
  
  if (activeSettings.mode === 'patterns') {
    // Unfortunately, since Firefox 57 and some releases afterwards, we were unable
    // to get anything of the URL except scheme, port, and host (because of Fx's PAC
    // implementation). Now we have access to rest of URL, like pre-57, but users
    // have written their patterns not anticipating that. Need to do more research
    // before using other parts of URL. For now, we ignore the other parts.
    const parsedUrl = new URL(url);
    const scheme = parsedUrl.protocol.substring(0, parsedUrl.protocol.length-1); // strip the colon
    const hostPort = parsedUrl.host; // This includes port if one is specified

    for (const proxy of activeSettings.proxySettings) {
      
      // Check black patterns first
      const blackMatch = proxy.blackPatterns.find(item => 
              (item.protocols === schemeSet.all || item.protocols === schemeSet[scheme]) &&
                item.pattern.test(hostPort));

      if (blackMatch) { continue; } // if blacklist matched, move to the next proxy

      //console.log(scheme, hostPort, proxy.whitePatterns, "hi");
      const whiteMatch = proxy.whitePatterns.find(item =>
              (item.protocols === schemeSet.all || item.protocols === schemeSet[scheme]) &&
                item.pattern.test(hostPort));
      
      if (whiteMatch) {
  			// found a whitelist match, end here
  			ret = prepareSetting(url);
        // TODO: use a Promise for sendToLogAndHandleToolbarIcon()
        sendToLogAndHandleToolbarIcon(url, proxy, whiteMatch);
        return ret;
  		}
    }
    // no white matches in any settings
    handleNoMatch(url);
    return DIRECT_SETTING;
  }
  else if (activeSettings.mode === 'disabled') {
    // Generally we won't get to this block because our proxy handler is turned off in this mode.
    // We will get here at startup and also if there is a race condition between removing our listener
    // (when switching to disabled mode) and handaling requests.
    return {type: 'direct'};    
  }
  else {
    // Fixed mode -- use 1 proxy for all URLs
    return prepareSetting(url, activeSettings.proxySettings[0], FOR_ALL);
  }
}

const typeSet = {
  1: 'http',    // PROXY_TYPE_HTTP
  2: 'https',   // PROXY_TYPE_HTTPS
  3: 'socks',   // PROXY_TYPE_SOCKS5
  4: 'socks4',  // PROXY_TYPE_SOCKS4
  5: 'direct'   // PROXY_TYPE_NONE
};

function prepareSetting(proxy) {
  const ret = {
    type: typeSet[proxy.type] || typeSet[5], // If 'direct', all other properties of this object are ignored.
    host: proxy.address, 
    port: proxy.port
  };
  proxy.username && (ret.username = proxy.username);
  proxy.password && (ret.password = proxy.password);
  proxy.proxyDNS && (ret.proxyDNS = proxy.proxyDNS); // Only useful for SOCKS
  if ((proxy.type === typeSet[1] || proxy.type === typeSet[2]) && proxy.username && proxy.password) {
    ret.proxyAuthorizationHeader = btoa(proxy.username + ":" + proxy.password);
  }
  return ret;
}

function sendToLogAndHandleToolbarIcon(url, proxy, matchedPattern) {
  const title = Utils.getProxyTitle(proxy);
  // log only the data that is needed for display
  logger && logger.active && logger.add({
    url,
    title,
    color: proxy.color,
    address: proxy.address,
    // Log should display whatever user typed, not our processed version.
    matchedPattern: matchedPattern.originalPattern,
    timestamp: Date.now()
  });
  //iconPath, color, i18nTitleKey, badgeText, badgeTextIsI18nKey
  Utils.updateIcon('images/icon.svg', proxy.color, title, false, title, false);
}

// Shortcuts so we dont make objects, perform i18n lookups for every non-match
const NOMATCH_TEXT = chrome.i18n.getMessage('noMatch');
const NONE_TEXT = chrome.i18n.getMessage('none');
const NOMATCH_COLOR = '#D3D3D3';
const NOMATCH_ICON = {path: 'images/gray.svg'};
const NOMATCH_TITLE = {title: NOMATCH_TEXT};
const NOMATCH_BADGE_TEXT = {text: NONE_TEXT};
const NOMATCH_BACKGROUND_COLOR = {color: NOMATCH_COLOR};
function handleNoMatch(url) {
  logger && logger.active && logger.add({
    url,
    title: NOMATCH_TEXT,
    color: NOMATCH_COLOR,
    address: '',
    matchedPattern: NOMATCH_TEXT,
    timestamp: Date.now()
  });  
  chrome.browserAction.setIcon(NOMATCH_ICON);
  chrome.browserAction.setTitle(NOMATCH_TITLE);
  chrome.browserAction.setBadgeText(NOMATCH_BADGE_TEXT); 
  chrome.browserAction.setBadgeBackgroundColor(NOMATCH_BACKGROUND_COLOR);  
}
