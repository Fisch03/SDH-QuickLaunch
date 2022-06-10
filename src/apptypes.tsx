export interface App {
  name: string;
}

export interface FlatpakApp extends App {
  package: string;
}
export function isFlatpak (app: App): app is FlatpakApp {
  return 'package' in app;
}
