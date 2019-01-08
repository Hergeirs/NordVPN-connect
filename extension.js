
const St = imports.gi.St;
const Main = imports.ui.main;
const Panel = imports.ui.panel;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Tweener = imports.ui.tweener;

const Mainloop = imports.mainloop;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const Util = imports.misc.util;
const GLib = imports.gi.GLib;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;




const COMMAND_SHELL= "/usr/bin/bash";


const Country_Dict= {
  al: "Albania", de: "Germany", pl: "Poland",
  ar: "Argentina", gr: "Greece", pt: "Portugal",
  au: "Australia", hk: "Hong_Kong", ro: "Romania",
  at: "Austria", hu: "Hungary", ru: "Russia",
  az: "Azerbaijan", is: "Iceland", rs: "Serbia",
  be: "Belgium", in: "India", sg: "Singapore",
  ba: "Bosnia_And_Herzegovina", id: "Indonesia", sk: "Slovakia",
  br: "Brazil", ie: "Ireland", si: "Slovenia",
  bg: "Bulgaria", il: "Israel", za: "South_Africa",
  ca: "Canada", it: "Italy", kp: "South_Korea",
  cl: "Chile", jp: "Japan", es: "Spain",
  cr: "Costa_Rica", lv: "Latvia", se: "Sweden",
  hr: "Croatia", lu: "Luxembourg", ch: "Switzerland",
  cy: "Cyprus", mk: "Macedonia", tw: "Taiwan",
  cz: "Czech_Republic", my: "Malaysia", th: "Thailand",
  dk: "Denmark", mx: "Mexico", tr: "Turkey",
  ee: "Estonia", md: "Moldova", ua: "Ukraine",
  fi: "Finland", nl: "Netherlands", uk: "United_Kingdom",//gb: "United_Kingdom",
  fr: "France", nz: "New_Zealand", us: "United_States",
  ge: "Georgia", no: "Norway", vn: "Vietnam"
};

class PlaceItem extends PopupMenu.PopupBaseMenuItem{
  constructor(str_Place){
    super();

    this.placeName= str_Place;

    this.checkIcon = new St.Icon({  icon_name: 'network-vpn-symbolic',
                                style_class: 'countries_submenu_label_item_selected_icon' });
    this.actor.add(this.checkIcon);

    let label_item= new St.Label({style_class: 'countries_submenu_label_item', text: this.placeName});
    this.actor.add(label_item);
    // log('[nvpn] creating placeitem for ' + str_Place);
    this.checkIcon.hide();
  }

  select(b=true){
    if (b){
      this.checkIcon.show();
    }
    else{
      this.checkIcon.hide();
    }
  }

  get PlaceName(){
    return this.placeName;
  }
};

class PlacesMenu extends PopupMenu.PopupSubMenuMenuItem{
  constructor(){
    super(_("Select country"), true);

    this.select_cb= null;
    this.cur_selected=null;

    this._ids_c_items= [];
  }

  destroy(){
    let children= this.menu._getMenuItems();
    let diff= 0;
    for(let i=0; i<this.menu.length; ++i){
      let item= children[i];
      if(item!==undefined){
        item.disconnect(this._ids_c_items[i-diff]);
      }
      else{
        ++diff;
      }
    }

    super.destroy();
  }

  add_place(str_Place){
    let item= new PlaceItem(str_Place);
    this.menu.addMenuItem(item);

    let t= this;
    this._ids_c_items.push(
      item.connect('activate', this._item_select.bind(this,item))
    );
  }

  select_callback(func=null){
    this.select_cb= func;
  }

  _item_select(item){
    log("[nvpn] item{pn="+item.PlaceName+"}.select("+(item==this.cur_selected).toString()+")");
    if(this.cur_selected!=null){
      this.cur_selected.select(false);
    }

    if(item==this.cur_selected){
      this.cur_selected= null;
      item.select(false);
    }
    else{
      this.cur_selected= item;
      item.select();
    }

    this.select_cb(this.LastSelectedPlaceName);
  }

  get LastSelectedPlaceName(){
    if (this.cur_selected!=null){
      return this.cur_selected.PlaceName;
    }
    else {
      return "";
    }
  }

  unselect_no_cb(){
    if (this.cur_selected!=null){
      this.cur_selected.select(false);
      this.cur_selected= null;
    }
  }

  select_from_name(placeName){
    let children= this.menu._getMenuItems();
    for(let i=0; i<this.menu.length; ++i){
      let item= children[i];
      if((item!==undefined) && (item.PlaceName===placeName)){
        if(this.cur_select!=null){
          this.cur_selected.select(false);
        }
        item.select();
        this.cur_selected= item;
      }
      else if (item===undefined) {
        log("[nvpn] Error: got item (n=" + i.toString() + ") undefined looking for \"" + placeName + "\"...");
      }
    }
  }
};

/** Class that implements the dedicated status area of the extension
 *  and contains its main menu
 */
class NVPNMenu extends PanelMenu.Button{
  /** Enumerator for the values of the "main states", this extension can be found in
   *  @readonly
   *  @enum {number}
   */
  static get STATUS() {
    return {
      /** If the 'nordvpn' tool isn't avaiblable for the extension **/
      NOT_FOUND: 0,
      /** The 'nordvpnd' systemd deamon isn't available or down **/
      DAEMON_DOWN: 1,
      /** The user hasn't set his logins through the nordvpn tool yet **/
      LOGGED_OUT: 2,
      /** The 'nordvpn' is processing and (dis)connection and his in transition **/
      TRANSITION: 3,
      /** Disconnected from any server **/
      DISCONNECTED: 4,
      /** connected to a server **/
      CONNECTED: 5
    };
  }

  /**
   * Initiate the UI element and creates the object.
   */
  constructor(){
    super(0.0, _("NordVPN"));

    /** @member {boolean} nvpn_monitor
     *  whether or not the extension monitors the state of the connection to
     *  nordvpn servers
     *  (contrary is experimental) */
    this.nvpn_monitor= true;

    /** this private member is used while reconnecting to another server
     * i.e.: when user wants to switch server locations
     * if this string is not empty during deconnection, the code will try
     *  to reconnect to the location designated by this string after disconnecting*/
    this._auto_connect_to= "";

    /** this private member is the horyzontal layout box contaning the server indicator
     * in the panel area*/
    this._panel_hbox= new St.BoxLayout({style_class: 'panel-status-menu-hbox'});
    /** the icon in the top panel area (may change according to current status)*/
    this._panel_icon = new St.Icon({ icon_name: 'action-unavailable-symbolic',
                               style_class: 'system-status-icon' });
    this._panel_hbox.add_child(this._panel_icon);

    /** 'NVPN' panel text label*/
    let label_nvpn= new St.Label({style_class: 'label-nvpn-panel', text: 'NVPN '});
    this._panel_hbox.add_child(label_nvpn);
    this.actor.add_child(this._panel_hbox);

    /** saving this idea for later disconnection of the signal during object's destruction*/
    this._id_c_click1= this.connect('clicked',
      /** when the panel is clicked, the extension performs a refresh of the menu's ui*/
      function(){
        if(!this.nvpn_monitor){
          this._update_status_and_ui();
        }
      }.bind(this)
    );

    /** this private member implements the menu that appears when user clicks on the top
     * panel's indicator*/
    this._main_menu = new PopupMenu.PopupBaseMenuItem({
            /** elements will not be interacive by default */
            reactive: false
        });

    /** vertical box layout, the first item of our menu, that will contain all
     * server information ui elements*/
    let vbox= new St.BoxLayout({style_class: 'nvpn-menu-vbox'});
    vbox.set_vertical(true);
    let hbox2= new St.BoxLayout({style_class: 'nvpn-menu-hbox'});
    let label1= new St.Label({style_class: 'label-nvpn-menu', text: _("NordVPN")});

    hbox2.add_child(label1);

    // log('[nvpn] is nvpn found? '+ this._is_NVPN_found().toString());
    // log('[nvpn] is nvpn connected? '+ this._is_NVPN_connected().toString());
    // log('[nvpn] nvpn status? '+ this._get_current_status().toString());

    /** this private member is the part of the server info that is an adaptable
     * text according to status*/
    this._label_status= new St.Label({style_class: 'label-nvpn-status'});
    /** this private member is the text label that will display the current nordvpn connected
     * server name*/
    this.label_connection= new St.Label({style_class: 'label-nvpn-connection', text: '--'});


    hbox2.add_child(this._label_status);

    vbox.add_child(hbox2);
    vbox.add_child(this.label_connection);

    this._main_menu.actor.add(vbox, { expand: true });


    this.menu.addMenuItem(this._main_menu,0);
    /** adding a sperator int his menu to separate the 'information display' part
     *  from the 'connection interface' part*/
    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    /** this private member is the implementation of the submenu that allows to select
     *  a nordvpn server by clicking on the country */
    this._submenu= new PlacesMenu();
    this.menu.addMenuItem(this._submenu);

    /** when an item of this submenu (i.e. a place name) is selected,
     *  the '_place_menu_new_selection()' method will be called (no argument). */
    this._submenu.select_callback(this._place_menu_new_selection.bind(this));

    /** call to private method that fill the 'country submenu' with all the required country name */
    this._fill_country_submenu();

    /** creating the menu item that contains the 'connection' menu button */
    let _itemCurrent2 = new PopupMenu.PopupBaseMenuItem({
            reactive: false
        });
    let vbox2= new St.BoxLayout({style_class: 'nvpn-menu-vbox2'});
    vbox2.set_vertical(true);

    this.label_action_btn= new St.Label({style_class: 'label-action-btn', text: _("Quick Connect")});
    this.action_button= new St.Button({style_class: 'nvpn-action-button', child:this.label_action_btn});

    /** saving this idea for later disconnection of the signal during object's destruction*/
    this._id_c_btn1= this.action_button.connect('clicked', this._button_clicked.bind(this));
    vbox2.add_child(this.action_button);

    _itemCurrent2.actor.add(vbox2, { expand: true });
    this.menu.addMenuItem(_itemCurrent2);

    /** @member {enum} currentStatus
     *  member that stored the current status designating the current state of the interaction
     *  with the 'nordvpn' tool */
    this.currentStatus= NVPNMenu.STATUS.DISCONNECTED;
    /** call to the private '_update_status_and_ui()' method that updates the ui and the currentStatus
     *  according to the current state provided of the 'nordvpn tool' */
    this._update_status_and_ui();

    /** this private member is a boolean that is used (when 'true') to keep the ui from updating during
     *  a connection transition, for instance */
    this._vpn_lock= false;
    /** call to the private method '_vpn_survey()' to start "the monitoring loop "
     *  that update the ui in case of a 'norvdpn' tool state change */
    this._vpn_survey();

    // log('[nvpn] nvpn server? '+ this. _get_server_text_info());
  }

  /**
   *  Disconnect the ui signals before the object's destruction
   */
  destroy(){
    this.disconnect(this._id_c_click1);
    this._id_c_click1= 0;
    this.action_button.disconnect(this._id_c_btn1);
    this._id_c_btn1= 0;

    super.destroy();
  }

  _is_NVPN_found(){
    return (GLib.spawn_command_line_sync(COMMAND_SHELL + " -c 'hash nordvpn'")[2].length === 0);
  }

  _is_NVPN_connected(){
    return !(GLib.spawn_command_line_sync(COMMAND_SHELL + " -c \"nordvpn status | grep -Po ' [cC]onnected'\"")[1].length===0);
  }

  _is_in_transition(){
    return (GLib.spawn_command_line_sync(COMMAND_SHELL + " -c \"nordvpn status | grep -Po '[cC]onnecting'\"")[1].length!==0);
  }

  _is_daemon_unreachable(){
    return !(GLib.spawn_command_line_sync(COMMAND_SHELL + " -c \"nordvpn status | grep -Po 'Daemon.*unreachable'\"")[1].length===0);
  }

  _is_user_logged_in(){
    return (GLib.spawn_command_line_sync(COMMAND_SHELL + " -c \"echo '' | nordvpn login | grep -Po 'already logged'\"")[1].length!==0);
  }

  _get_current_status(){
    if (!(this._is_NVPN_found())){
      return NVPNMenu.STATUS.NOT_FOUND;
    }
    else{
      if (this._is_NVPN_connected()){
        return NVPNMenu.STATUS.CONNECTED;
      }
      else if (this._is_daemon_unreachable()) {
        return NVPNMenu.STATUS.DAEMON_DOWN;
      }
      else if (!this._is_user_logged_in()){
        return NVPNMenu.STATUS.LOGGED_OUT;
      }
      else if(this._is_in_transition()){
        return NVPNMenu.STATUS.TRANSITION;
      }
      else{
        return NVPNMenu.STATUS.DISCONNECTED;
      }
    }
  }

  _update_status_and_ui(){
    if(this._vpn_lock) return;
    this._vpn_lock= true;
    this.currentStatus= this._get_current_status();

    this.setSensitive(true);

    switch(this.currentStatus){
    case NVPNMenu.STATUS.DAEMON_DOWN:
    case NVPNMenu.STATUS.LOGGED_OUT:
    case NVPNMenu.STATUS.NOT_FOUND:
      this._label_status.text= (this.currentStatus===NVPNMenu.STATUS.LOGGED_OUT)?
                                _(" nordvpn tool not logged in")
                              : (this.currentStatus===NVPNMenu.STATUS.DAEMON_DOWN)?
                                _(" daemon disabled/missing ")
                              : _(" tool not found.");

      this.label_connection.text= "--";

      this.action_button.style_class= 'nvpn-action-button-help';
      this.label_action_btn.text= _("Help?");

      this._panel_hbox.style_class='panel-status-menu-hbox-problem';
      this._panel_icon.icon_name= 'network-vpn-no-route-symbolic';

      this._submenu.actor.hide();

      break;
    case NVPNMenu.STATUS.TRANSITION:
      this._waiting_state();

      break;
    case NVPNMenu.STATUS.DISCONNECTED:
      this._label_status.text= _(" disconnected.");

      this.label_connection.text= "--";

      this.action_button.style_class= 'nvpn-action-button';
      this.label_action_btn.text= _("Quick Connect (default)");

      this._panel_hbox.style_class='panel-status-menu-hbox';
      this._panel_icon.icon_name= 'action-unavailable-symbolic';

      this._submenu.actor.show();
      this._submenu.unselect_no_cb();

      break;
    case NVPNMenu.STATUS.CONNECTED:
      this._label_status.text= _(" connected to");

      let server_txt= this._get_server_text_info();
      this.label_connection.text= server_txt;
      this.action_button.style_class= 'nvpn-action-button-dq';
      this.label_action_btn.text= _("Disconnect");

      this._panel_hbox.style_class='panel-status-menu-hbox-connected';
      this._panel_icon.icon_name= 'network-vpn-symbolic';

      this._submenu.actor.show();
      if(this._submenu.LastSelectedPlaceName.length ===0){
        let rgx= /- ([a-z]*)[0-9]*.*$/g;
        let arr= rgx.exec(server_txt);
        if((arr!==null) && (arr[1]!==undefined)){
          let country= Country_Dict[arr[1]];
          if (country!==undefined){
             // log('[nvpn] finding '+country);
            this._submenu.select_from_name(country);
          }
        }
      }

      break;
    }
    this._vpn_lock= false;
  }

  _get_server_text_info(){
    if(this.currentStatus === NVPNMenu.STATUS.CONNECTED){
      return "-"+
          GLib.spawn_command_line_sync(COMMAND_SHELL + " -c \"nordvpn status | grep -Po 'Current server: .*\\..*\\..*' | cut -d: -f2 | cut -d: -f2\"")[1].toString().replace(/(\r\n\t|\n|\r\t)/gm,"")
              +" -" ;
    }
    else{
      return "--";
    }
  }

  _waiting_state(){
      this.setSensitive(false);
      this.menu.close();
      this._panel_icon.icon_name= 'network-vpn-acquiring-symbolic';
      this._panel_hbox.style_class='panel-status-menu-hbox';
  }

  _nordvpn_quickconnect(placeName=""){
    let cmd= COMMAND_SHELL + " -c \"nordvpn c " + placeName + "\"";
    if(this.nvpn_monitor){

      this._vpn_lock= true;


      GLib.spawn_command_line_async( cmd );
      this._waiting_state();
      this.current_status= NVPNMenu.STATUS.TRANSITION;

      this._vpn_lock= false;
    }
    else{
      GLib.spawn_command_line_sync( cmd );
    }
  }

  _nordvpn_disconnect(){
    let cmd= COMMAND_SHELL + " -c \"nordvpn d\"";
    if(this.nvpn_monitor){

      this._vpn_lock= true;

      GLib.spawn_command_line_async( cmd );
      this._waiting_state();
      this.current_status= NVPNMenu.STATUS.TRANSITION;

      this._vpn_lock= false;
    }
    else{
      GLib.spawn_command_line_sync( cmd );
    }
  }

  _nordvpn_ch_connect(placeName=""){
    if(placeName.length!==0){
      this._auto_connect_to= placeName;
      this._nordvpn_disconnect();
    }
    if(!this.nvpn_monitor){
      this._nordvpn_quickconnect(placeName);
    }

  }

  _button_clicked(){
    // log('[nvpn] button clicked?');
    switch(this.currentStatus){
    case NVPNMenu.STATUS.NOT_FOUND:
    case NVPNMenu.STATUS.LOGGED_OUT:
    case NVPNMenu.STATUS.DAEMON_DOWN:
    case NVPNMenu.STATUS.TRANSITION:

      break;
    case NVPNMenu.STATUS.DISCONNECTED:

      let strPlace= this._submenu.LastSelectedPlaceName;
      if(strPlace.length===0){
        this. _nordvpn_quickconnect();
        // log('[nvpn] -> sh -c \"nordvpn c\"?');
      }

      break;
    case NVPNMenu.STATUS.CONNECTED:
      this._nordvpn_disconnect();
        // log('[nvpn] -> sh -c \"nordvpn d\"?');


      break;
    }

    if(!this.nvpn_monitor){
      this._update_status_and_ui();
    }
  }

  _get_countries_list(){
    let l=[];
    for (let country in Country_Dict){
      l.push(Country_Dict[country]);
    }

    return l.sort();
  }

  _fill_country_submenu(){
    let country_list= this. _get_countries_list();
    let tsm= this._submenu;

    country_list.forEach(function(elmt){
      tsm.add_place(elmt);
    });
  }

  _place_menu_new_selection(placeName){
    // log("[nvpn] Clicked on " + placeName + " s= "+this.currentStatus.toString());
    if(this.currentStatus===NVPNMenu.STATUS.DISCONNECTED){
      this._nordvpn_quickconnect(placeName);
      // log('[nvpn] -> sh -c \"nordvpn c ' + placeName + '\"?');
    }
    else{
      if((this.currentStatus===NVPNMenu.STATUS.CONNECTED)){
        // log('[nvpn] -> sh -c \"nordvpn d\"?');

        if(placeName.length!==0){
          this._nordvpn_ch_connect(placeName);
          // log('[nvpn] -> sh -c \"nordvpn c ' + placeName + '\"?');
        }
        else{
          this._nordvpn_disconnect();
        }
      }
    }

    if(!this.nvpn_monitor){
      this._update_status_and_ui();
    }
  }

  _vpn_survey(){
    if(!this.nvpn_monitor) return;

    if(!this._vpn_lock){
      this._vpn_check();

      if(this._vpn_timeout){
        Mainloop.source_remove(this._vpn_timeout);
        this._vpn_timeout= null;
      }
    }

    this._vpn_timeout= Mainloop.timeout_add_seconds(2,this._vpn_survey.bind(this));
  }

  _vpn_check(){
    let change= false;
    switch(this.currentStatus){
    case NVPNMenu.STATUS.LOGGED_OUT:
      change= this._is_user_logged_in();

      break;
    case NVPNMenu.STATUS.NOT_FOUND:
      change= this._is_NVPN_found();

      break;
    case NVPNMenu.STATUS.DAEMON_DOWN:
      change= ( GLib.spawn_command_line_sync(COMMAND_SHELL + " -c \"systemctl status nordvpnd 2> /dev/null | grep 'active (running)'\"")[1].toString().length!==0 );

      break;
    case NVPNMenu.STATUS.TRANSITION:
      change= !(this._is_in_transition());

      break;
    case NVPNMenu.STATUS.DISCONNECTED:
      change= ( GLib.spawn_command_line_sync(COMMAND_SHELL + " -c \"ifconfig -a | grep tun0\"")[1].toString().length!==0 );

      break;
    case NVPNMenu.STATUS.CONNECTED:
      change= ( GLib.spawn_command_line_sync(COMMAND_SHELL + " -c \"ifconfig -a | grep tun0\"")[1].toString().length===0 );
      if(change){
        this._submenu.unselect_no_cb();

        // log("[nvpn] act= "+this._auto_connect_to)
        if(this._auto_connect_to.length!==0){
          this.currentStatus= NVPNMenu.STATUS.DISCONNECTED;

          // log("[nvpn] hi!")
          this._nordvpn_quickconnect(this._auto_connect_to);

          this._auto_connect_to="";
          change= false;
        }
      }

      break;
    }

    if (change){
      this._update_status_and_ui();
    }
  }

  set_monitoring(b){
    if(b!=this.nvpn_monitor){
      this.nvpn_monitor= b;

      if(b){
        this._vpn_survey();
      }
    }
  }


};

function init() {
    Convenience.initTranslations();
}

let _indicator;

function enable() {
    _indicator= new NVPNMenu;
    Main.panel.addToStatusArea('nvpn-menu', _indicator);
}

function disable() {
    _indicator.destroy();
}

