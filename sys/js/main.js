var unzip = require('unzip');
var exec = require('child_process').exec;
var walker = require('walk');
var gui = require('nw.gui');
var path = require('path');
var win = gui.Window.get();
var fs = require('fs');
//var nodeFS = require('node-fs');
var fsExtra = require('fs-extra');
var tray = new gui.Tray({ icon: 'sys/img/icons/refresh.png' });
var m, read, write;
last = {};
// Get the minimize event
win.on('minimize', function() {
	// Hide window
	this.hide();
	win.resizeBy(0,0);
	
	
	// Show window and remove tray when clicked
	tray.on('click', function() {
		win.show();
		win.resizeBy(0,0);
	});
});

function suppose(cmd, ops){
	
	d = {
		
		spawn: require('child_process').spawn(cmd, ops),
		
		array: {},
		
		error: function(func){
			this.errorFunc = func;
			return this;
		},
		
		on: function(a,b){
			this.array[a] = b;
			return this;
		},				
		
		end: function(func){
			this.endFunc = func;
			var ddd = this;
			this.spawn.stdout.on('data', function(d){
				var data = d.toString().trim();
				if(ddd.array[data]){
					ddd.spawn.stdin.write(ddd.array[data]+'\n');
					setTimeout(function(){p.spawn.stdin.write('\n');},200);
					delete ddd.array[data];
				}
			}).on('error', function(data){
				(ddd.errorFunc||function(){})(data);
			});
			this.spawn.on('close', function(data){
				(ddd.endFunc||function(){})(data);
				
			});
			return this;
		},
		
	};
	
	return d;

}

function Master($scope, $timeout){
	
	m = $scope;
	
	m.toggleDevTools = function(){
		if(win.isDevToolsOpen()){
			win.closeDevTools();
		}
		else{
			win.showDevTools();
		}
	};
	
	m.config = (function(){
		var data = storage('config') || {};
		
		data.hour = data.hour || false;
		data.minute = data.minute || false;
		data.from = data.from || false;
		data.to = data.to || false;
		
		m.$watch('config', function(a,b,c){
			storage('config', JSON.parse(angular.toJson(a)));
		}, true);
	
	
	
		return data;
	})();
	
	m.getAllFiles = function(directory, callback){
		
		var files = [];
		
		walker.walk(directory, { followLinks: false })
		
		.on('file', function(root, stats, next){
			files.push(root+'/'+stats.name);
			next();
		})
		
		//report errors
		.on('nodeError', function(err){
			console.log(err);
		})
			
		//done!
		.on('end', function(stat){
			m.safeApply((callback||function(){})(files));
		});
		
		
	};
	
	m.refreshDrives = function (callback){
		var drives = ['a','b','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z'];
		var count = 0;
		for(var i = 0; i<drives.length; i++){
			var v = drives[i];
			var drivesByLetter = {};
			var drivesBySerial = {};
			var array = [];
			(function(v){
				exec('vol '+v+':', function(err,stdout,stderr){
					count++;
					if(!err){
						var t = stdout.split('\r\n');
						var serial = t[1].replace(' Volume Serial Number is ','');
						var letter = v.toUpperCase();
						var name = t[0].replace('Volume in drive '+letter+' has no label.', '').replace('Volume in drive '+letter+' is', '').trim();
						array.push(drivesByLetter[letter] = drivesBySerial[serial] = {letter: letter, serial:serial, name: name});

					}
					if(count === drives.length) {
						(callback||function(){})({letter: drivesByLetter, serial: drivesBySerial, array:array});
						m.safeApply();
					}
				});
			})(v)
		}
	};
	
	m.safeApply = function(fn) {
		var phase = this.$root.$$phase;
		if(phase == '$apply' || phase == '$digest') {
			if(fn && (typeof(fn) === 'function')) {
				fn();
			}
		} else {
			this.$apply(fn);
		}
	};

	m.format = function(drive, driveName, callback) {
		
		if(drive.toUpperCase() != 'C'){
			p = suppose('format', [drive+':', '/V:'+(driveName||''), '/X', '/Y', '/FS:NTFS', '/Q'])
			.on('Enter current volume label for drive '+drive+':', driveName+'\n')
			.on('WARNING, ALL DATA ON NON-REMOVABLE DISK\r\nDRIVE '+drive+': WILL BE LOST!\r\nProceed with Format (Y/N)?', 'Y\n')
			.error(function(){  })
			.end(function(code){
				m.safeApply((callback||function(){})());
			});
		}
		
	};
	
	m.refreshDrives(function(a){
		m.drives = a;
	});

	m.copy = function(from, to, callback){
		m.safeApply();
		m.getAllFiles(from+':', function(files){
			m.maxFiles = files.length;
			m.currentFile = m.maxFiles- files.length;
			var handle = function(){
				var file = files.shift();
				if(file && m.running){
					file = path.resolve(file);

					var newFile = path.resolve(to+file.substr(1));
					fsExtra.mkdirs(newFile, function(err){
						if(err)console.log(err);
						fs.rmdir(newFile, function(err){
							if(err)console.log(err);
							read = fs.createReadStream(file);
							write = fs.createWriteStream(newFile);
							read.pipe(write);
							write.on('error', function(err){
								if(err)console.log(err);
							});
							
							write.on('close', function(){
								m.currentFile = m.maxFiles - files.length;
								m.safeApply();
								handle();
							});
						});
					});
				}
				else{
					(callback||function(){})();
				}
				m.safeApply();
			};
			
			handle();
			m.safeApply();
		});
	};
	
	m.time = {
		hour: (new Date()).getHours(),
		minute:(new Date()).getMinutes()
	}
	
	m.dayNames = [
		'Mon',
		'Tue',
		'Wed',
		'Thur',
		'Fri',
		'Sat',
		'Sun',
	];
	
	m.$watch('time', function(){
		$timeout(function(){
		var nd = (new Date());
			m.time = {
				hour: nd.getHours(),
				minute:nd.getMinutes(),
				date:m.dayNames[nd.getDay()]+', '+nd.getDate()+'/'+nd.getMonth()
			};
			
			if(m.config.active && !m.running && m.time.hour === m.config.hour && m.time.minute === m.config.minute && m.drives.serial[m.config.to] && m.drives.serial[m.config.from] && (!m.last || m.last.minute !== m.time.minute || m.last.hour !== m.time.hour || m.last.date !== m.time.date)){
				m.run();
			}
		},100);
	});

	m.cancelCopy = function(){
		
		m.running = false;
		m.maxFiles = false;
		m.currentFile = false;
		
		var nd = (new Date());
		m.last = {
			hour: nd.getHours(),
			minute:nd.getMinutes(),
			date:m.dayNames[nd.getDay()]+', '+nd.getDate()+'/'+nd.getMonth()
		};
		
		if(write){
			write.close();
			write = undefined;
		}
		if(read){
			read.close();
			read = undefined;
		}
		
	};

	m.run = function(){
		m.running = true;
		m.safeApply();
		var from  = m.drives.serial[m.config.from];
		var to  = m.drives.serial[m.config.to];
		m.format( to.letter, to.name, function(){
			m.refreshDrives(function(a){
				m.drives = a;
				m.config.from = a.letter[from.letter].serial;
				m.config.to = a.letter[to.letter].serial;
				m.safeApply();
				m.copy( from.letter , to.letter, function(){
					m.running = false;
					var nd =(new Date());
					m.last = {
						hour: nd.getHours(),
						minute:nd.getMinutes(),
						date:m.dayNames[nd.getDay()]+', '+nd.getDate()+'/'+nd.getMonth()
					};
					m.cancelCopy();
					m.safeApply();
				});
			});
		});
	};

	m.force = function(){
		if(m.drives.serial[m.config.to] && m.drives.serial[m.config.from]){
			if(confirm('Are you sure you want to run the backup?')) {
				m.run();
			}
		}
	};
	
	m.refresh = function(){
		if (m.running) {
			m.cancelCopy();
		}
		else if(m.drives.serial[m.config.to] && m.drives.serial[m.config.from]){
			m.force();
		}
	};

	m.checkUpdate = function(){
		$.get('https://github.com/schme16/Backup-Tool', function(data){
			var newVersion = $(data).find('.js-zeroclipboard.zeroclipboard-link').data('clipboard-text');
			if (storage('version') != newVersion) {
				var https = require('https');

				https.get({
					host: 'codeload.github.com',
					port: 443,
					path: '/schme16/Backup-Tool/zip/master'
				},
				function(res){
					fs.unlink('temp.zip', function(){
						var t = res.pipe(fs.createWriteStream('temp.zip'));
						t.on('close', function(){
							storage('version', newVersion);
							var k = fs.createReadStream('temp.zip').pipe(unzip.Extract({ path: 'package/'+'temp' }));
							k.on('close', function(){
								fs.renameSync('package/temp/Backup-Tool-master', 'package/'+newVersion);
								
								var t; 
								eval('t = '+fs.readFileSync('package/'+newVersion+'/package.json').toString());
								console.log(t);
								t.window.icon = 'package/'+newVersion+'/sys/img/icons/refresh.png';
								t.main = 'app://backup/package/'+newVersion+'/sys/index.html';
								fs.writeFileSync('package.json', JSON.stringify(t));
								fs.unlink('temp.zip', function(){});
								console.log('Done!');
								
							});
						});
					});
				});
			}
		}, 'text');
	};
	
}



process.on('uncaughtException', function(err) {
	console.log(err);
	m.cancelCopy();
});	


// Get the current window
//var win = gui.Window.get();
//win.minimize();


angular.module('Photography Backup', ['ui.bootstrap']);





















