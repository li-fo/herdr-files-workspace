// Internal tree dragging stays inside the panel. Leaving it cancels the gesture.
export class FileDrag {
  start(position, items, root, on) { this.state = {position,items,root,on,active:false,target:null}; this.suppressClick=false; }
  destination(target) {
    if (target === null || !this.state) return null;
    return this.state.items.some(item => {
      const parent = item.path.includes("/") ? item.path.slice(0,item.path.lastIndexOf("/")) : "";
      return target === parent || (item.dir && (target === item.path || target.startsWith(item.path + "/")));
    }) ? null : target;
  }
  move(position, target) {
    const state=this.state;
    if (!state) return false;
    const was=state.active, previous=state.target;
    if (Math.hypot(position.x-state.position.x,position.y-state.position.y)>=6) state.active=true;
    state.target=this.destination(target);
    return was!==state.active || (state.active && previous!==state.target);
  }
  finish(target) {
    target=this.destination(target);
    const state=this.state; this.state=null;
    if (!state?.active) return null;
    this.suppressClick=true;
    return target === null ? null : {...state,target};
  }
  cancel() { if (this.state?.active) this.suppressClick=true; this.state=null; }
}
