declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FACE_PHOTOS: R2Bucket;
    SUPABASE_URL?: string;
    SUPABASE_PUBLISHABLE_KEY?: string;
  }
}
