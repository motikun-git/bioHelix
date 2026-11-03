import { get } from './api.js';
import { useLoad } from '../components/ui.jsx';

/** Programs and batches are needed on many admin screens. */
export function usePrograms() {
  return useLoad(() => get('/programs'));
}

export function useBatches(query = '') {
  return useLoad(() => get(`/batches${query}`), [query]);
}

export const DAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
