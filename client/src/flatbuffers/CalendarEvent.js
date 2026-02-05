import * as flatbuffers from "flatbuffers";

export class CalendarEvent {
  constructor() {
    this.bb = null;
    this.bb_pos = 0;
  }

  __init(i, bb) {
    this.bb_pos = i;
    this.bb = bb;
    return this;
  }

  id() {
    const o = this.bb.__offset(this.bb_pos, 4);
    return o ? this.bb.readInt64(this.bb_pos + o) : null;
  }

  title() {
    const o = this.bb.__offset(this.bb_pos, 6);
    return o ? this.bb.__string(this.bb_pos + o) : null;
  }

  location() {
    const o = this.bb.__offset(this.bb_pos, 8);
    return o ? this.bb.__string(this.bb_pos + o) : null;
  }

  organizer() {
    const o = this.bb.__offset(this.bb_pos, 10);
    return o ? this.bb.__string(this.bb_pos + o) : null;
  }

  startTime() {
    const o = this.bb.__offset(this.bb_pos, 12);
    return o ? this.bb.readInt64(this.bb_pos + o) : null;
  }

  endTime() {
    const o = this.bb.__offset(this.bb_pos, 14);
    return o ? this.bb.readInt64(this.bb_pos + o) : null;
  }

  attendees() {
    const o = this.bb.__offset(this.bb_pos, 16);
    return o ? this.bb.readInt32(this.bb_pos + o) : 0;
  }

  allDay() {
    const o = this.bb.__offset(this.bb_pos, 18);
    return o ? this.bb.readInt8(this.bb_pos + o) !== 0 : false;
  }

  description() {
    const o = this.bb.__offset(this.bb_pos, 20);
    return o ? this.bb.__string(this.bb_pos + o) : null;
  }

  tags(index) {
    const o = this.bb.__offset(this.bb_pos, 22);
    return o ? this.bb.__string(this.bb.__indirect(this.bb.__vector(this.bb_pos + o) + index * 4)) : null;
  }

  tagsLength() {
    const o = this.bb.__offset(this.bb_pos, 22);
    return o ? this.bb.__vector_len(this.bb_pos + o) : 0;
  }

  resources(index) {
    const o = this.bb.__offset(this.bb_pos, 24);
    return o ? this.bb.__string(this.bb.__indirect(this.bb.__vector(this.bb_pos + o) + index * 4)) : null;
  }

  resourcesLength() {
    const o = this.bb.__offset(this.bb_pos, 24);
    return o ? this.bb.__vector_len(this.bb_pos + o) : 0;
  }

  createdAt() {
    const o = this.bb.__offset(this.bb_pos, 26);
    return o ? this.bb.readInt64(this.bb_pos + o) : null;
  }

  updatedAt() {
    const o = this.bb.__offset(this.bb_pos, 28);
    return o ? this.bb.readInt64(this.bb_pos + o) : null;
  }

  priority() {
    const o = this.bb.__offset(this.bb_pos, 30);
    return o ? this.bb.readInt32(this.bb_pos + o) : 0;
  }

  timezone() {
    const o = this.bb.__offset(this.bb_pos, 32);
    return o ? this.bb.__string(this.bb_pos + o) : null;
  }
}
