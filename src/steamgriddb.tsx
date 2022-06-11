import { TextField } from "decky-frontend-lib";
import { Component } from "react";

export class GridDBPanel extends Component<{ enabled: boolean, onUpdate: (key: string) => void, initialKey:string}, {key: string, initialKeyHasBeenSet: boolean}> {
  constructor(props:any) {
    super(props);
    this.state = {
      key: "",
      initialKeyHasBeenSet: false
    };
  }

  render() {
    //This is kind of a terrible method of doing things but whatever
    if(this.state.key === "" && this.props.initialKey !== "" && !this.state.initialKeyHasBeenSet) {
      this.setState({
        key: this.props.initialKey,
        initialKeyHasBeenSet: true
      });
    }

    if(this.props.enabled) {
      return (
        <TextField
          label="SteamGridDB API Key"
          value={this.state.key}
          onChange={(e) => {
            this.setState({key: e.target.value});
            this.props.onUpdate(e.target.value);
          }}
        />
      )
    }
    return null;
  }
}