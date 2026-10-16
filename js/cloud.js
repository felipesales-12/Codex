import { cloudConfig } from './cloud-config.js';

// Load only the selected provider, including its independent session storage.
const provider = await import(cloudConfig.provider === 'firebase' ? './firebase-cloud.js' : './supabase-cloud.js');
export const { cloudState, subscribeCloud, initializeCloud, cloudDatabase, signIn, signUp, sendRecovery, updatePassword, signOut } = provider;
