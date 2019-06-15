class Item {
	constructor(index, wdId) {
		this.index = index;
		this.status = "pending"
		this.wdId = wdId;
		this.osmIds = null;

		this.row = Item.ItemRow.generateRow(index, this.status, wdId);
	}

	getElement() {
		return this.row.getElement();
	}
	getStatus() {
		return this.row.statusCell.find("span").text();
	}
	setStatus(status) {
		this.row.statusCell.find("span").removeClass(`status-${this.status.replace(/ /g, "-")}`);

		this.status = status;
		this.row.statusCell.find("span").text(this.status).addClass(`status-${status.replace(/ /g, "-")}`);
	}
	addOsmId(osmId) {
		if(this.osmIds == null) this.osmIds = [];
		this.osmIds.push(osmId);
		this.updateOsmIds();
	}
	setOsmIds(osmIds) {
		this.osmIds = osmIds;
		this.updateOsmIds();
	}
	updateOsmIds() {
		if(this.osmIds == null) {
			this.row.osmIdsCell.text("");
		} else {
			var out = $("<ul></ul>");
			$.each(this.osmIds, function(i, osmId) {
				out.append(`<li><a href="${getOsmUrl(osmId)}">${osmId}</a></li>`);
			});
			this.row.osmIdsCell.empty().append(out);
		}

		function getOsmUrl(osmId) {
			if(osmId.startsWith("n")) {
				return `https://osm.org/node/${osmId.substr(1)}`;
			} else if(osmId.startsWith("w")) {
				return `https://osm.org/way/${osmId.substr(1)}`;
			} else if(osmId.startsWith("r")) {
				return `https://osm.org/relation/${osmId.substr(1)}`;
			} else {
				throw "Invalid osmId";
			}
		}
	}
	getWdId() {
		return this.wdId;
	}
}
Item.ItemRow = class {
	constructor(index, row, indexCell, statusCell, wdIdCell, osmIdsCell) {
		this.index = index;
		this.row = row;
		this.indexCell = indexCell;
		this.statusCell = statusCell;
		this.wdIdCell = wdIdCell;
		this.osmIdsCell = osmIdsCell;
	}

	getElement() {
		return this.row;
	}
}
Item.ItemRow.generateRow = function(index, status, wdId) {
	var indexCell = $(`<th scope="row">${index}</th>`);
	var statusCell = $(`<td><span class="status status-${status.replace(/ /g, "_")}">${status}</span></td>`);
	var wdIdCell = $(`<td><a href="https://wikidata.org/wiki/${wdId}">${wdId}</a></td>`);
	var osmIdsCell = $(`<td>&nbsp;</td>`);
	
	var row = $(`<tr data-index="${index}"></tr>`);
	row.append(indexCell);
	row.append(statusCell);
	row.append(wdIdCell);
	row.append(osmIdsCell);
	
	return new Item.ItemRow(index, row, indexCell, statusCell, wdIdCell, osmIdsCell);
}

var requestQueue = new RequestQueue(1);
jQuery(document).ready(function($) {
	$("#button-parse").removeAttr("disabled").click(function(e) {
		e.preventDefault();
		$(this).attr("disabled", "disabled");

		var userInput_entities = parseUserInput();

		// Reset table
		if(userInput_entities.length > 0) {
			var items = generateItems(userInput_entities);
			generateTable(items);
			requestOsmData(items);
		} else {
			$("#table-output tbody").html(`<tr><td colspan="4">No data</td></tr>`);
			$(this).removeAttr("disabled", "disabled");
			return;
		}
	});
});
function generateItems(wdIds) {
	var items = [];
	$.each(wdIds, function(i, wdId) {
		var item = new Item(i+1, wdId);
		items.push(item);
	});
	return items;
}
function generateTable(items) {
	$("#table-output tbody").empty();
	$.each(items, function(i, item) {
		$("#table-output tbody").append(item.getElement());
	});	
}
function parseUserInput() {
	elements = [];
	$.each($("#commands").val().split("\n"), function(a, b) {
		b = b.replace(/ /, "");
		if(/^Q[0-9]+$/.test(b)) {
			elements.push(b);
		} else {
			console.warn("Invalid user input");
		}
	});
	return elements;
}
function requestOsmData(items) {
	var itemsCopy = items.slice(0);

	while(itemsCopy.length > 0) {
		requestQueue.enqueueRequest(function(requestQueue, data) {
			var overpassRequest = itemsToOverpass(data.itemsSegment);
			var itemDictionary = itemsToItemDictionary(data.itemsSegment);

			$.each(itemDictionary, function(i, val) {
				val.setStatus("working");
			});

			$.ajax({
				data: {
					data: `[out:json][timeout:25];(${overpassRequest});out tags;`
				},
				url: "https://overpass-api.de/api/interpreter"
			}).always(function(e) {
				requestQueue._finishRequest();
			}).done(function(e) {
				$.each(e.elements, function(i, item) {
					if(typeof item.tags.wikidata != "undefined" && itemDictionary[item.tags.wikidata] != "undefined") {
						itemDictionary[item.tags.wikidata].addOsmId(getOsmId(item.id, item.type));
						itemDictionary[item.tags.wikidata].setStatus("success");
					}
				});
				$.each(itemDictionary, function(i, val) {
					if(val.getStatus() == "working") val.setStatus("no results");
				});
			}).fail(function(e) {
				$.each(itemDictionary, function(i, val) {
					val.setStatus("error");
				});
				console.error(e);
			});
		}, {
			itemsSegment: itemsCopy.slice(0,50)
		});
		
		itemsCopy = itemsCopy.slice(50);
	}

	function getOsmId(id, type) {
		return `${type.substr(0,1)}${id}`;
	}
	function itemsToItemDictionary(items) {
		var out = {};
		$.each(items, function(i, item) {
			out[item.getWdId()] = item;
		});
		return out;
	}
	function itemsToOverpass(items) {
		var out = "";
		$.each(items, function(i, item) {
			out += `nwr["wikidata"="${item.getWdId()}"];`;
		});
		return out;
	}
}