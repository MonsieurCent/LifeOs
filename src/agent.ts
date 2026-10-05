import { fetchHealthData } from './health.js';
import { isAuthenticated } from './auth.js';

export interface AgentInsight {
  timestamp: string;
  summary: string;
  recommendations: string[];
}

/**
 * Fitbit AI Agent foundation
 * Prepares data streams from Google Health API for AI consumption
 */
export class FitbitAiAgent {
  public isReady(): boolean {
    return isAuthenticated();
  }

  public async getLatestHealthSummary(): Promise<any> {
    if (!this.isReady()) {
      throw new Error('Fitbit AI Agent requires authentication via Google Health API.');
    }
    return await fetchHealthData('users/me/summary');
  }
}
