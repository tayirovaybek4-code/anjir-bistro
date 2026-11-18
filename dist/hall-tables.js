"use strict";
// Static floor layout for viewing only. Availability and bookings always require
// a successful live response; these records never establish an available table.
window.HALL_TABLES = Object.freeze([
  {id:1,name:"01",capacity:2},
  {id:2,name:"02",capacity:4},
  {id:3,name:"03",capacity:2},
  {id:4,name:"04",capacity:4},
  {id:5,name:"05",capacity:6},
  {id:6,name:"06",capacity:4},
  {id:7,name:"07",capacity:2},
  {id:8,name:"08",capacity:6},
  {id:9,name:"09",capacity:2},
  {id:10,name:"10",capacity:8}
].map(Object.freeze));
