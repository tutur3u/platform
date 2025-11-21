/**
 * Session Manager for Analytics
 * Handles visitor ID generation, session management, and client-side data collection
 */

const SESSION_STORAGE_KEY = 'tuturuuu_session_id';
const VISITOR_STORAGE_KEY = 'tuturuuu_visitor_id';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Session data collected from the client environment
 */
export interface SessionData {
  sessionId: string;
  visitorId: string;
  deviceType?: string;
  deviceBrand?: string;
  deviceModel?: string;
  browser?: string;
  browserVersion?: string;
  os?: string;
  osVersion?: string;
  screenWidth?: number;
  screenHeight?: number;
  language?: string;
  userAgent?: string;
  timezone?: string;
}

/**
 * Session Manager handles session lifecycle and device fingerprinting
 */
export class SessionManager {
  private sessionData: SessionData | null = null;
  private lastActivityTime: number = Date.now();
  private isBrowser: boolean;

  constructor() {
    this.isBrowser = typeof window !== 'undefined';

    if (this.isBrowser) {
      this.initializeSession();
    }
  }

  /**
   * Get or create the current session
   */
  getSession(): SessionData {
    if (!this.isBrowser) {
      // Server-side: generate minimal session data
      return this.generateServerSession();
    }

    // Check if session has expired
    if (this.isSessionExpired()) {
      this.startNewSession();
    } else {
      this.updateLastActivity();
    }

    if (!this.sessionData) {
      this.initializeSession();
    }

    return this.sessionData!;
  }

  /**
   * Start a new session (resets session ID but keeps visitor ID)
   */
  startNewSession(): void {
    if (!this.isBrowser) return;

    const visitorId = this.getOrCreateVisitorId();
    const sessionId = this.generateUUID();

    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    }

    this.sessionData = this.collectSessionData(sessionId, visitorId);
    this.lastActivityTime = Date.now();
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string {
    return this.getSession().sessionId;
  }

  /**
   * Get the current visitor ID
   */
  getVisitorId(): string {
    return this.getSession().visitorId;
  }

  /**
   * Initialize or restore session
   */
  private initializeSession(): void {
    if (!this.isBrowser) return;

    const visitorId = this.getOrCreateVisitorId();
    let sessionId: string | null = null;

    // Try to restore session ID from sessionStorage
    if (typeof sessionStorage !== 'undefined') {
      sessionId = sessionStorage.getItem(SESSION_STORAGE_KEY);
    }

    // Check if session has expired
    if (sessionId && this.isSessionExpired()) {
      sessionId = null;
    }

    // Create new session if none exists or expired
    if (!sessionId) {
      sessionId = this.generateUUID();
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
      }
    }

    this.sessionData = this.collectSessionData(sessionId, visitorId);
    this.lastActivityTime = Date.now();
  }

  /**
   * Get or create visitor ID (persistent across sessions)
   */
  private getOrCreateVisitorId(): string {
    if (!this.isBrowser) {
      return this.generateUUID();
    }

    let visitorId: string | null = null;

    // Try to get from localStorage
    if (typeof localStorage !== 'undefined') {
      visitorId = localStorage.getItem(VISITOR_STORAGE_KEY);
    }

    if (!visitorId) {
      // Generate visitor fingerprint
      visitorId = this.generateVisitorFingerprint();

      // Store in localStorage
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(VISITOR_STORAGE_KEY, visitorId);
        } catch (e) {
          // LocalStorage might be disabled
          console.warn('Failed to store visitor ID:', e);
        }
      }
    }

    return visitorId;
  }

  /**
   * Generate a visitor fingerprint based on device characteristics
   */
  private generateVisitorFingerprint(): string {
    if (!this.isBrowser) {
      return this.generateUUID();
    }

    const components: string[] = [];

    // User agent
    if (navigator.userAgent) {
      components.push(navigator.userAgent);
    }

    // Screen resolution
    if (window.screen) {
      components.push(`${window.screen.width}x${window.screen.height}`);
      components.push(`${window.screen.colorDepth}`);
    }

    // Timezone
    try {
      components.push(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch (e) {
      // Ignore
    }

    // Language
    if (navigator.language) {
      components.push(navigator.language);
    }

    // Platform
    if (navigator.platform) {
      components.push(navigator.platform);
    }

    // Hardware concurrency (CPU cores)
    if (navigator.hardwareConcurrency) {
      components.push(String(navigator.hardwareConcurrency));
    }

    // Generate hash from components
    const fingerprint = components.join('|');
    return this.simpleHash(fingerprint);
  }

  /**
   * Collect comprehensive session data from browser environment
   */
  private collectSessionData(sessionId: string, visitorId: string): SessionData {
    if (!this.isBrowser) {
      return {
        sessionId,
        visitorId,
      };
    }

    const data: SessionData = {
      sessionId,
      visitorId,
      userAgent: navigator.userAgent,
      language: navigator.language,
    };

    // Screen information
    if (window.screen) {
      data.screenWidth = window.screen.width;
      data.screenHeight = window.screen.height;
    }

    // Timezone
    try {
      data.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (e) {
      // Ignore
    }

    // Parse user agent for device, browser, and OS info
    const uaInfo = this.parseUserAgent(navigator.userAgent);
    Object.assign(data, uaInfo);

    return data;
  }

  /**
   * Parse user agent string to extract device, browser, and OS information
   */
  private parseUserAgent(userAgent: string): Partial<SessionData> {
    const result: Partial<SessionData> = {};

    // Detect browser
    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
      result.browser = 'Chrome';
      const match = userAgent.match(/Chrome\/(\d+)/);
      if (match) result.browserVersion = match[1];
    } else if (userAgent.includes('Firefox')) {
      result.browser = 'Firefox';
      const match = userAgent.match(/Firefox\/(\d+)/);
      if (match) result.browserVersion = match[1];
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      result.browser = 'Safari';
      const match = userAgent.match(/Version\/(\d+)/);
      if (match) result.browserVersion = match[1];
    } else if (userAgent.includes('Edg')) {
      result.browser = 'Edge';
      const match = userAgent.match(/Edg\/(\d+)/);
      if (match) result.browserVersion = match[1];
    } else if (userAgent.includes('Opera') || userAgent.includes('OPR')) {
      result.browser = 'Opera';
      const match = userAgent.match(/(?:Opera|OPR)\/(\d+)/);
      if (match) result.browserVersion = match[1];
    }

    // Detect OS
    if (userAgent.includes('Windows')) {
      result.os = 'Windows';
      if (userAgent.includes('Windows NT 10.0')) result.osVersion = '10';
      else if (userAgent.includes('Windows NT 6.3')) result.osVersion = '8.1';
      else if (userAgent.includes('Windows NT 6.2')) result.osVersion = '8';
      else if (userAgent.includes('Windows NT 6.1')) result.osVersion = '7';
    } else if (userAgent.includes('Mac OS X')) {
      result.os = 'macOS';
      const match = userAgent.match(/Mac OS X (\d+[._]\d+)/);
      if (match) result.osVersion = match[1].replace('_', '.');
    } else if (userAgent.includes('Android')) {
      result.os = 'Android';
      const match = userAgent.match(/Android (\d+(?:\.\d+)?)/);
      if (match) result.osVersion = match[1];
    } else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
      result.os = 'iOS';
      const match = userAgent.match(/OS (\d+_\d+)/);
      if (match) result.osVersion = match[1].replace('_', '.');
    } else if (userAgent.includes('Linux')) {
      result.os = 'Linux';
    }

    // Detect device type and details
    if (userAgent.includes('iPhone')) {
      result.deviceType = 'mobile';
      result.deviceBrand = 'Apple';
      const match = userAgent.match(/iPhone(\d+,\d+)?/);
      if (match) result.deviceModel = match[0];
    } else if (userAgent.includes('iPad')) {
      result.deviceType = 'tablet';
      result.deviceBrand = 'Apple';
      result.deviceModel = 'iPad';
    } else if (userAgent.includes('Android')) {
      result.deviceType = userAgent.includes('Mobile') ? 'mobile' : 'tablet';

      // Try to extract brand from user agent
      if (userAgent.includes('Samsung')) {
        result.deviceBrand = 'Samsung';
      } else if (userAgent.includes('Pixel')) {
        result.deviceBrand = 'Google';
      } else if (userAgent.includes('Huawei')) {
        result.deviceBrand = 'Huawei';
      } else if (userAgent.includes('Xiaomi')) {
        result.deviceBrand = 'Xiaomi';
      }
    } else {
      result.deviceType = 'desktop';
    }

    return result;
  }

  /**
   * Check if the session has expired
   */
  private isSessionExpired(): boolean {
    const now = Date.now();
    return now - this.lastActivityTime > SESSION_TIMEOUT_MS;
  }

  /**
   * Update last activity timestamp
   */
  private updateLastActivity(): void {
    this.lastActivityTime = Date.now();
  }

  /**
   * Generate a server-side minimal session
   */
  private generateServerSession(): SessionData {
    return {
      sessionId: this.generateUUID(),
      visitorId: this.generateUUID(),
    };
  }

  /**
   * Generate a UUID v4
   */
  private generateUUID(): string {
    if (this.isBrowser && crypto && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    // Fallback UUID generation
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Simple hash function for fingerprinting
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    // Convert to positive hex string with UUID format
    const hashHex = Math.abs(hash).toString(16).padStart(8, '0');
    return `${hashHex.slice(0, 8)}-${hashHex.slice(0, 4)}-4${hashHex.slice(0, 3)}-${hashHex.slice(0, 4)}-${hashHex}${Date.now().toString(16)}`;
  }
}
