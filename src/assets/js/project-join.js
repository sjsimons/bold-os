// The Projects page's join button, as one plain function (no DOM, no Firebase), so it can be
// tested (tests/projects-join.test.cjs): a project the viewer is already on (`joined`, from
// getAllProjects) says so, greyed out, instead of offering to join it again.
(function(root){
  root.BoldProjectJoin = {
    joinState: function(p){
      return p && p.joined
        ? { label: 'Joined', disabled: true, title: 'You’re on this project' }
        : { label: 'Join the project', disabled: false, title: '' };
    }
  };
})(this);
