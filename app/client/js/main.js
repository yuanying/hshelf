import m from 'mithril';
import $ from 'jquery'
import 'bootstrap';

import Favs from './models/fav'
import Targets from './models/targets'

import Home from './views/home';
import Index from './views/index';
import NavBar from './views/navbar';
import '../css/bootstrap.min.css';
import '../css/main.css';

import 'photoswipe/dist/photoswipe.css';
import 'photoswipe/dist/default-skin/default-skin.css';

m.route.mode = "hash";

Favs.loadAll();
let targets = Targets.index();

const home = m.component(Home, { targets: targets });
const index = m.component(Index, { targets: targets })

m.mount(document.getElementById('navbar'),
                                m.component(NavBar, {
                                    title: 'hshelf',
                                    favs: Favs
                                }));

m.route(document.getElementById('root'), '/', {
    '/': home,
    '/:index': index,
    '/:index/:path...': index
});
