/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional back-end URL; when set, the form POSTs the payload there. */
  readonly VITE_FNOL_ENDPOINT?: string;
}
