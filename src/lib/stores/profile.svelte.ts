import { errorMessage, profileApi } from '$lib/api';
import type { Profile } from '$lib/types';

/** Per-user visual preferences stored by the active Toolsmith instance. */
class ProfileStore {
  data = $state<Profile | null>(null);

  async load() {
    try {
      this.data = await profileApi.get();
    } catch {
      /* Keep the profile defaults until the server answers. */
    }
  }

  async save(input: Partial<Pick<Profile, 'displayName' | 'avatarColor'>>): Promise<string | null> {
    const before = this.data;
    if (before) this.data = { ...before, ...input };
    try {
      this.data = await profileApi.update(input);
      return null;
    } catch (error) {
      this.data = before;
      return errorMessage(error, 'Unable to save profile');
    }
  }
}

export const profile = new ProfileStore();
