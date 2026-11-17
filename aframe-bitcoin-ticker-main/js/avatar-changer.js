AFRAME.registerComponent("avatar-switcher", {
  init: function () {
    var maleAvatar = document.querySelector("#male-avatar");
    var femaleAvatar = document.querySelector("#female-avatar");

    var self = this;

    this.el.addEventListener("click", function () {
      if (self.el.id === "male-switcher") {
        maleAvatar.setAttribute("visible", "true");
        femaleAvatar.setAttribute("visible", "false");
      } else if (self.el.id === "female-switcher") {
        maleAvatar.setAttribute("visible", "false");
        femaleAvatar.setAttribute("visible", "true");
      }
    });
  },
});
