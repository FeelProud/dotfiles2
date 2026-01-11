import app from "ags/gtk4/app";
import { Gdk } from "ags/gtk4";
import GLib from "gi://GLib";
import { createRoot } from "ags";
import style from "./style.scss";

import { TopBar, BottomBar } from "./modules/bar";
import { OSD } from "./modules/osd";
import { ArchLogoPopup } from "./modules/system-monitor";
import { BatteryPopup } from "./modules/power-control";
import { BluetoothPopup } from "./modules/bluetooth";
import { WifiPopup } from "./modules/wifi";
import { PowerPopup } from "./modules/powermenu";
import { AgendaPopup } from "./modules/quick-menu";
import { AudioPopup, DisplayPopup } from "./modules/settings";
import { NotificationPopup } from "./modules/notification";

const barsByMonitor = new Map<string, string[]>();
let syncTimer: number | null = null;

const StaticWindows = [
    ArchLogoPopup, BatteryPopup, BluetoothPopup, WifiPopup,
    PowerPopup, AgendaPopup, AudioPopup, DisplayPopup, OSD, NotificationPopup
];

function getSafeId(connector: string): string {
    return connector.replace(/[^a-zA-Z0-9]/g, "-");
}

function destroyBarsForMonitor(connector: string) {
    const barNames = barsByMonitor.get(connector);
    if (!barNames) return;

    barNames.forEach(name => {
        const win = app.get_window(name);
        if (win) {
            console.log(`[AGS] Destroying bar: ${name}`);
            app.remove_window(win);
            win.close();
        }
    });
    barsByMonitor.delete(connector);
}


function syncBarsWithMonitors(): boolean {
    const display = Gdk.Display.get_default();
    if (!display) return false;

    const monitors = display.get_monitors();
    const currentConnectors = new Set<string>();
    let createdAny = false;

    for (let i = 0; i < monitors.get_n_items(); i++) {
        const mon = monitors.get_item(i) as Gdk.Monitor;
        const conn = mon.get_connector();
        if (conn) currentConnectors.add(conn);
    }

    for (const connector of barsByMonitor.keys()) {
        if (!currentConnectors.has(connector)) {
            destroyBarsForMonitor(connector);
        }
    }

    for (let i = 0; i < monitors.get_n_items(); i++) {
        const mon = monitors.get_item(i) as Gdk.Monitor;
        const connector = mon.get_connector();

        if (connector && !barsByMonitor.has(connector)) {
            const id = getSafeId(connector);

            createRoot(() => {
                const top = TopBar(mon, id);
                const bottom = BottomBar(mon, id);
                if (top) app.add_window(top);
                if (bottom) app.add_window(bottom);
                barsByMonitor.set(connector, [`top-bar-${id}`, `bottom-bar-${id}`]);
            });
            createdAny = true;
        }
    }
    return createdAny;
}

function setupMonitorWatcher() {
    const display = Gdk.Display.get_default();
    const monitors = display?.get_monitors();
    if (!monitors) return;

    monitors.connect("items-changed", (_list, _pos, removed, added) => {
        if (removed > 0) syncBarsWithMonitors();

        if (added > 0) {
            if (syncTimer) GLib.source_remove(syncTimer);

            syncTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
                syncBarsWithMonitors();

                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                    syncBarsWithMonitors();
                    return GLib.SOURCE_REMOVE;
                });

                syncTimer = null;
                return GLib.SOURCE_REMOVE;
            });
        }
    });
}

app.start({
    css: style,
    requestHandler(request, res) {
        if (request === "sync") { syncBarsWithMonitors(); res("Done"); }
        if (request === "quit") { app.quit(); res("Quitting"); }
    },

    main() {
        setupMonitorWatcher();
        syncBarsWithMonitors();

        createRoot(() => {
            StaticWindows.forEach(fn => {
                const win = fn();
                if (win) app.add_window(win);
            });
        });
    },
});
