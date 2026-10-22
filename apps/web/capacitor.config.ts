import type { CapacitorConfig } from "@capacitor/cli";

// appId = package_name de assetlinks.json (docs/assetlinks.md). Cambiarlo después de publicar no es posible en Play.
const config: CapacitorConfig = {
  appId: "online.redasistir.cuidarte",
  appName: "Cuidarte+",
  webDir: "dist",
  android: { allowMixedContent: false },
  plugins: {
    LocalNotifications: { smallIcon: "ic_stat_cuidarte", iconColor: "#2f5d56" },
  },
};

export default config;
