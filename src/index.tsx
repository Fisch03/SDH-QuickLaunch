import {
  definePlugin,
  Menu,
  MenuItem,
  PanelSection,
  PanelSectionRow,
  ServerAPI,
  showContextMenu,
  staticClasses,
} from "decky-frontend-lib";
import { useLayoutEffect } from "react";
import { VFC } from "react";
import { FaRocket } from "react-icons/fa";

import { fetchApps, launchApp } from "./utils";

// interface AddMethodArgs {
//   left: number;
//   right: number;
// }

function showList(serverAPI: ServerAPI, appList: any) {
  showContextMenu(
    <Menu label="Menu" cancelText="Plugin Menu" onCancel={() => {}}>
      {
        appList.map((app: any) => (
          <MenuItem onSelected={() => {launchApp(serverAPI, app.package)}}>{app.name}</MenuItem>
        ))
      }
    </Menu>
  )
}

const Content: VFC<{ serverAPI: ServerAPI }> = ({ serverAPI }) => {
  useLayoutEffect(() => {
    (async () => {
      let appList = await fetchApps(serverAPI);
      showList(serverAPI, appList);
    })();
  });

  return (
    <PanelSection title="Settings">
      <PanelSectionRow>
        Settings go here...
      </PanelSectionRow>
    </PanelSection>
  );
};

export default definePlugin((serverApi: ServerAPI) => {
  return {
    title: <div className={staticClasses.Title}>SDH-QuickLaunch</div>,
    content: <Content serverAPI={serverApi} />,
    icon: <FaRocket />,
  };
});
