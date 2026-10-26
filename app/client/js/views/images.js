import m from 'mithril';
import PhotoSwipe from 'photoswipe';
import PhotoSwipeUI_Default from 'photoswipe/dist/photoswipe-ui-default';

export default {
  controller: (args) => {
    let imageUrl = (image) => {
      return `api/image/${args.index}/${image.path}`;
    };
    let movieUrl = (image) => {
      return `api/movie/${args.index}/${image.path}`;
    };
    let thumbUrl = (image) => {
      return `api/thumbs/${args.index}/${image.path}`;
    };
    let images = args.images.map((image, index) => {
      image['src'] = imageUrl(image);
      image['title'] = movieUrl(image);
      if (image['movie']) {
        image['movie'] = movieUrl(image);
      }
      return image;
    });
    let photoswipe = function(e) {
      let pswpElement = document.querySelectorAll('.pswp')[0];
      let options = {
        index: parseInt(this.dataset.index),
        captionEl: true,
        shareButtons: [
          {id:'download', label:'Download image', url:'{{raw_image_url}}', download:true}
        ],
        addCaptionHTMLFn: function( item, captionEl, isFake ) {
            console.log(item.movie);
          if (item.movie) {
            captionEl.children[0].innerHTML = `<div class="playCaption"><a href="${item.movie}" class="glyphicon glyphicon-play"></a></div>`;
            return true;
          } else {
            captionEl.children[0].innerHTML = '';
            return false;
          }
        }
      };
      var gallery = new PhotoSwipe( pswpElement, PhotoSwipeUI_Default, images, options);
      gallery.init();
      e.preventDefault();
    };
    return {
      photoswipe: photoswipe,
      imageUrl: imageUrl,
      thumbUrl: thumbUrl
    }
  },
  view: (ctrl, args) => {
    return m('.container-fluid.images', [
      m('.row' , args.images.map((image, index) => {
        let attr = {
          href: ctrl.imageUrl(image),
          onclick: ctrl.photoswipe,
          "data-index": index
        };
        let playButton = null;
        if (image.movie) {
          playButton = m('.play-button-wrapper', m('.play-button-inner', m('span.play-button.glyphicon.glyphicon-play')));
        }
        return m('a', attr, [
          m('.col-xs-3.col-sm-2.col-md-1.col-lg-1.image', [
            playButton,
            m('img', { loading: 'lazy', src: ctrl.thumbUrl(image) }),
          ])
        ]);
      }))
    ]);
  }
};
