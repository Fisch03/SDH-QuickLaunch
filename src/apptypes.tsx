export interface App {
  name: string;
  exec: string;
}

export function getLaunchOptions(app: App) {
  let launchOptions: string[] = app.exec.split(" ")
  launchOptions.shift()
  return launchOptions.join(" ")
}

export function getTarget(app: App) {
  let target: string[] = app.exec.split(" ")
  return target[0]
}