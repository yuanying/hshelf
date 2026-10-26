ENV['RACK_ENV'] = 'production'

require 'minitest/autorun'
require 'rack'
require 'rack/test'
require 'tmpdir'
require 'fileutils'
require 'json'
require 'yaml'
require 'cgi'

# The server reads its config when the class is loaded, so the image
# directories have to exist before config.ru is required.
FIXTURE_ROOT = Dir.mktmpdir('hshelf-test')
IMAGE_DIR = File.join(FIXTURE_ROOT, 'images')
TMP_DIR = File.join(FIXTURE_ROOT, 'cache')
NESTED_DIR = File.join(IMAGE_DIR, '画像 1')

FileUtils.mkdir_p(NESTED_DIR)
system('convert', '-size', '400x300', 'xc:red', File.join(IMAGE_DIR, 'a.jpg')) or raise('convert failed')
system('convert', '-size', '300x500', 'xc:blue', File.join(NESTED_DIR, 'b c.png')) or raise('convert failed')
system('convert', '-delay', '10', '-size', '300x200', 'xc:green', 'xc:yellow', File.join(IMAGE_DIR, 'anim.gif')) or raise('convert failed')
File.write(File.join(IMAGE_DIR, 'a.mp4'), 'movie')
File.write(File.join(IMAGE_DIR, 'notes.txt'), 'not an image')
File.write(File.join(FIXTURE_ROOT, 'config.yml'), {
  'image_dirs' => [{ 'path' => IMAGE_DIR, 'name' => 'My Images' }],
  'tmp_dir' => TMP_DIR,
}.to_yaml)
ENV['APHRAEL_CONFIG'] = File.join(FIXTURE_ROOT, 'config.yml')
Minitest.after_run { FileUtils.rm_rf(FIXTURE_ROOT) }

# Rack 2 returns [app, options], Rack 3 returns the app.
APP = Array(Rack::Builder.parse_file(File.expand_path('../config.ru', __dir__))).first

class ServerTest < Minitest::Test
  include Rack::Test::Methods

  def app
    APP
  end

  # Metadata is cached on first access and keeps the path it was asked for,
  # so a test must not see what an earlier one left behind.
  def setup
    FileUtils.rm_rf(TMP_DIR)
  end

  def get_json(path)
    get path
    assert_equal 200, last_response.status, last_response.body
    JSON.parse(last_response.body)
  end

  def test_root_serves_the_page
    get '/'
    assert_equal 200, last_response.status
    assert_includes last_response.body, '<script src="js/main.js"></script>'
  end

  def test_static_images_are_served_from_dist
    get '/images/folder.png'
    assert_equal 200, last_response.status
    assert_equal 'image/png', last_response.content_type
  end

  def test_index_lists_image_dirs_without_their_paths
    assert_equal [{ 'name' => 'My Images', 'index' => 0 }], get_json('/api/index')
  end

  def test_dirs_lists_children_and_images
    body = get_json('/api/dirs/0/')
    assert_equal [{ 'path' => '%E7%94%BB%E5%83%8F%201', 'name' => '%E7%94%BB%E5%83%8F%201' }], body['dirs']
    assert_equal [
      { 'path' => '/a.jpg', 'w' => 400, 'h' => 300, 'movie' => true },
      { 'path' => '/anim.gif', 'w' => 300, 'h' => 200 },
    ], body['images']
  end

  def test_dirs_accepts_an_escaped_nested_path
    body = get_json("/api/dirs/0/#{CGI.escape('画像 1').gsub('+', '%20')}")
    assert_equal [], body['dirs']
    assert_equal [{ 'path' => '画像 1/b c.png', 'w' => 300, 'h' => 500 }], body['images']
  end

  def test_thumbnail_of_an_image_is_a_256px_square_sent_by_nginx
    get '/api/thumbs/0/a.jpg'
    assert_equal 200, last_response.status
    thumb = last_response.headers['X-Accel-Redirect']
    assert_equal File.join(TMP_DIR, 'thumb', IMAGE_DIR, 'a.jpg'), thumb
    assert_equal '256x256', `identify -format %wx%h #{thumb}`
  end

  # nginx sends the thumbnail as another user, so it has to be readable by others.
  def test_thumbnail_is_readable_by_nginx
    get '/api/thumbs/0/a.jpg'
    assert_equal 200, last_response.status
    assert_equal 0o644, File.stat(last_response.headers['X-Accel-Redirect']).mode & 0o777
  end

  def test_thumbnail_of_an_animated_gif_is_its_first_frame
    get '/api/thumbs/0/anim.gif'
    assert_equal 200, last_response.status
    thumb = last_response.headers['X-Accel-Redirect']
    assert_equal File.join(TMP_DIR, 'thumb', IMAGE_DIR, 'anim.gif'), thumb
    assert_equal '256x256', `identify -format %wx%h #{thumb}`
  end

  def test_thumbnail_of_a_directory_is_its_first_image
    get "/api/thumbs/0/#{CGI.escape('画像 1').gsub('+', '%20')}"
    assert_equal 200, last_response.status
    assert_equal File.join(TMP_DIR, 'thumb', NESTED_DIR, 'b c.png'), last_response.headers['X-Accel-Redirect']
  end

  def test_image_is_sent_by_nginx
    get '/api/image/0/a.jpg'
    assert_equal 200, last_response.status
    assert_equal File.join(IMAGE_DIR, 'a.jpg'), last_response.headers['X-Accel-Redirect']
    assert_equal 'image/jpeg', last_response.content_type
  end

  def test_movie_is_sent_by_nginx
    get '/api/movie/0/a.jpg'
    assert_equal 200, last_response.status
    assert_equal File.join(IMAGE_DIR, 'a.mp4'), last_response.headers['X-Accel-Redirect']
  end
end
