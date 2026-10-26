require 'mini_magick'

class Aphrael::Image < Aphrael::Resource

  SUPPORTED_FORMATS = ['.png', '.PNG', '.jpg', '.JPG', '.jpeg', '.gif', '.GIF']

  def self.get index, path
    @cache ||= {}
    real_path = Aphrael::Resource.real_path(index, path)
    unless image = @cache[real_path]
      image = Aphrael::Image.new(index, path)
    end
    image
  end

  def initialize index, path
    super
    create_metadata
  end

  attr_reader :metadata

  def image
    unless @image
      open(self.real_path) do |io|
        @image = MiniMagick::Image.read(io.read)
      end
    end
    @image
  end

  def create_metadata
    if File.exist?(metadata_path)
      open(metadata_path) do |io|
        @metadata = JSON.parse(io.read)
      end
      return
    end
    FileUtils.mkdir_p(File.dirname(metadata_path)) unless File.exist?(File.dirname(metadata_path))

    @metadata = {
      path: self.path,
      w: image[:width],
      h: image[:height],
    }
    if self.has_movie?
      @metadata[:movie] = true
    end
    open(metadata_path, 'w') do |io|
      io.write(@metadata.to_json)
    end
  rescue
    puts self.path
  end

  def create_thumbnail
    return if File.exist?(thumbnail_path)

    FileUtils.mkdir_p(File.dirname(thumbnail_path)) unless File.exist?(File.dirname(thumbnail_path))

    if image.mime_type.match /gif/
      _image = image.collapse!
    else
      _image = image
    end
    _image = image
    narrow = _image[:width] > _image[:height] ? _image[:height] : _image[:width]
    _image.combine_options do |c|
      c.gravity "center"
      if _image.mime_type.match /gif/
        c.crop "#{narrow}x#{narrow}+0+0!"
      else
        c.crop "#{narrow}x#{narrow}+0+0"
      end
     end
     _image.resize "#{256}x#{256}"
     _image.write(thumbnail_path)
  rescue => ex
    require 'pp'
    pp ex
    puts "Cannot create thumbnail: #{path}"
    FileUtils.rm_f(thumbnail_path) if File.exist?(thumbnail_path)
  end

  def has_movie?
    File.file?(self.movie_real_path)
  end

  def movie_path
    dirname = File.dirname(self.path)
    basename = File.basename(self.path, '.*')

    "#{dirname}/#{basename}.mp4"
  end

  def movie_real_path
    self.class.real_path(index, movie_path)
  end

  def thumbnail_path
    File.join(Aphrael::Resource.tmp_dir, 'thumb', real_path)
  end

  def metadata_path
    File.join(Aphrael::Resource.tmp_dir, 'meta', "#{real_path}.json")
  end

end
