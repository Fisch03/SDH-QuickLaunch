import {
  ServerAPI,
  ConfirmModal,
  ToastData,
  TextField,
  FilePickerRes,
  
} from "decky-frontend-lib"
import { useEffect, useState } from "react"
import { App } from "./apptypes"

export const ShortcutOptionsModal = (props: {closeModal?: CallableFunction, createAppShortcut: CallableFunction, filepath: FilePickerRes, serverAPI: ServerAPI}) => {
  const closeModal = () => { if (props.closeModal) {props.closeModal()} }
  const {createAppShortcut, filepath, serverAPI} = props
  const [shortcutName, setShortcutName] = useState<string>(filepath.path)
  const [compatTool, setCompatTool] = useState<string|undefined>()
  useEffect(()=>{
    let filenameWithExtension = filepath.realpath.split(/[\\\/]/).pop() // potentially has an extension
    let filename = filenameWithExtension
    let fileext = ''
    if (filenameWithExtension) {
      filename = filenameWithExtension.slice(0, filenameWithExtension.lastIndexOf('.'))
      fileext = filenameWithExtension.slice(filenameWithExtension.lastIndexOf('.')+1, filenameWithExtension.length).toLowerCase()
    }
    let path = filepath.realpath.substring(0, filepath.realpath.length - (filenameWithExtension ? filenameWithExtension.length : 0))
    localStorage.setItem('decky-addtosteam', path)
    let appName = filename || filenameWithExtension || 'MissingAppName'
    setShortcutName(appName)
    if (['exe', 'bat'].includes(fileext)) setCompatTool('proton-experimental')
  },[])

  const onCreateShortcut = () => {
    let app:App = {
      name: shortcutName,
      exec: filepath.realpath
    }
    createAppShortcut(app, "", "", compatTool)
    let toastData: ToastData = {
      title: 'Added Shortcut',
      body: shortcutName,
      playSound: true,
      showToast: true
    }
    serverAPI.toaster.toast(toastData)
  }

  return (
    <ConfirmModal
      strTitle='Shortcut Options'
      strOKButtonText='Create'
      closeModal={closeModal}
      onOK={onCreateShortcut}
      onCancel={closeModal}
      onEscKeypress={closeModal}>
        <TextField
          label='Title'
          focusOnMount={true}
          value={shortcutName}
          onChange={(e) => setShortcutName(e.currentTarget.value)} />
    </ConfirmModal>
  )
}