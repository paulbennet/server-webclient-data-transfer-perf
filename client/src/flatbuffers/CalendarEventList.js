import * as flatbuffers from "flatbuffers";
import { CalendarEvent } from "./CalendarEvent.js";

export class CalendarEventList {
  constructor() {
    this.bb = null;
    this.bb_pos = 0;
  }

  __init(i, bb) {
    this.bb_pos = i;
    this.bb = bb;
    return this;
  }

  static getRootAsCalendarEventList(bb, obj) {
    return (obj || new CalendarEventList()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }

  events(index, obj) {
    const o = this.bb.__offset(this.bb_pos, 4);
    return o
      ? (obj || new CalendarEvent()).__init(
          this.bb.__indirect(this.bb.__vector(this.bb_pos + o) + index * 4),
          this.bb
        )
      : null;
  }

  eventsLength() {
    const o = this.bb.__offset(this.bb_pos, 4);
    return o ? this.bb.__vector_len(this.bb_pos + o) : 0;
  }
}
